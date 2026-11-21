// Copyright (C) 2026 Alexandre Demartin

import { sep } from 'node:path';
import type * as TS from 'typescript';
import { fileKey, scan } from './scan';
import type { ResultField } from './values';

type Query = ReturnType<typeof scan>['queries'][number];
export interface Described { text: string; fields: readonly ResultField[] | null }

export interface Hooks {
  /** Describe one query. A rejection is printed through error and fails the round. */
  describe(query: Query): Promise<Described>;
  /** Write the module if its bytes differ. Return whether it did. */
  write(rows: ReadonlyMap<string, Described>): Promise<boolean>;
  log(line: string): void;
  error(line: string): void;
  /** End the session: the first round could not read the root tsconfig, so nothing watches it. */
  end(): void;
}

/**
 * Scan the project now and after each change of its sources, then describe the queries whose text changed
 * and write their module. When the module differs from the one the last round left, every query is described again. A program per tsconfig, the root and each project reference, is kept between rounds.
 * Rounds run one at a time. A failing round prints its errors and keeps watching, except a first one that could not read the root tsconfig.
 */
export function watch(ts: typeof TS, project: string, path: string, hooks: Hooks) {
  const key = fileKey(ts);
  const rows = key(path), watches = new Map<string, TS.WatchOfConfigFile<TS.BuilderProgram>>();
  const cache = new Map<string, { signature: string; described: Described }>(), timers = new Set<ReturnType<typeof setTimeout>>();
  let closed = false, queued = false, settled = false, running = Promise.resolve(), left: string | undefined;
  const parented = new WeakSet<TS.SourceFile>();

  function trigger() {
    if (closed || queued) return;
    queued = true;
    running = running.then(round);
  }

  function programOf(file: string) {
    let existing = watches.get(key(file));
    if (!existing) {
      let created = false;
      const host = ts.createWatchCompilerHost(file, {}, ts.sys, undefined, () => undefined, () => undefined);
      // The generated module may not exist yet, and the scan reads imports by their parent pointers.
      Object.assign(host, {
        fileExists: (name: string) => key(name) === rows || ts.sys.fileExists(name),
        directoryExists: (name: string) => rows.startsWith(key(name) + sep) || !!ts.sys.directoryExists(name),
        readFile: (name: string) => ts.sys.readFile(name) ?? (key(name) === rows ? '' : undefined),
        createProgram: (...args: Parameters<typeof ts.createEmitAndSemanticDiagnosticsBuilderProgram>) => {
          const compilerHost = args[2] as TS.CompilerHost, getSourceFile = compilerHost.getSourceFile;
          compilerHost.getSourceFile = (...parameters) => {
            const source = getSourceFile.apply(compilerHost, parameters);
            if (source && !source.isDeclarationFile && !parented.has(source)) {
              parented.add(source);
              const link = (node: TS.Node) => ts.forEachChild(node, child => { (child as { parent: TS.Node }).parent = node; link(child); });
              link(source);
            }
            return source;
          };
          return ts.createEmitAndSemanticDiagnosticsBuilderProgram(...args);
        },
        // The scan reports a tsconfig that cannot be read. The default handler would exit the process.
        onUnRecoverableConfigFileDiagnostic: () => undefined,
        afterProgramCreate: () => { if (created) trigger(); },
        // A watch's close() leaves its pending update, which would build the program and watch again.
        // An update throws when its tsconfig is gone: the round reports it, and the update reruns once the file is back.
        setTimeout: (callback: (...args: unknown[]) => void, ms: number, ...args: unknown[]) => {
          const timer = setTimeout(() => {
            timers.delete(timer);
            if (closed) return;
            try { callback(...args); } catch { trigger(); }
          }, ms);
          timers.add(timer);
          return timer;
        },
        clearTimeout: (timer: ReturnType<typeof setTimeout>) => { timers.delete(timer); clearTimeout(timer); },
      });
      existing = ts.createWatchProgram(host);
      created = true;
      watches.set(key(file), existing);
    }
    return existing.getProgram().getProgram();
  }

  async function round() {
    queued = false;
    if (closed) return;
    try {
      let found: ReturnType<typeof scan>;
      // The scan throws when the root tsconfig cannot be read, as when it is removed: a plain run reports it here too.
      try { found = scan(ts, project, path, programOf); } catch (error) {
        found = { queries: [], diagnostics: [{ file: project, line: 1, column: 1, message: (error as Error).message }] };
      }
      // The output file is ours to rewrite, as in a plain run.
      const { queries } = found, diagnostics = found.diagnostics.filter(d => key(d.file) !== rows);
      if (diagnostics.length) {
        for (const d of diagnostics) hooks.error(`${d.file}:${d.line}:${d.column} ${d.message}`);
        settled = false;
        if (!watches.has(key(project))) hooks.end();
        return;
      }
      // Another run, such as a plain one after a migration, wrote rows the cache may not match.
      if (ts.sys.readFile(path) !== left) cache.clear();
      const described = new Map<string, Described>();
      let failed = false;
      for (const query of queries) {
        const signature = JSON.stringify([query.text, query.variants?.texts]), hit = cache.get(query.name);
        if (hit?.signature === signature) { described.set(query.name, hit.described); continue; }
        try {
          const row = await hooks.describe(query);
          cache.set(query.name, { signature, described: row });
          described.set(query.name, row);
        } catch (error) {
          cache.delete(query.name);
          hooks.error((error as Error).message);
          failed = true;
        }
      }
      for (const name of cache.keys()) if (!queries.some(query => query.name === name)) cache.delete(name);
      if (failed || closed) { settled = false; return; }
      const written = await hooks.write(described);
      left = ts.sys.readFile(path);
      if (written || !settled) hooks.log(`${path}: ${described.size} ${described.size === 1 ? 'query' : 'queries'}`);
      settled = true;
    } catch (error) {
      hooks.error((error as Error).message);
      settled = false;
    }
  }

  trigger();
  return {
    /** Stop watching and wait for the round in progress. */
    async close() {
      closed = true;
      for (const watched of watches.values()) watched.close();
      for (const timer of timers) clearTimeout(timer);
      await running;
    },
  };
}
