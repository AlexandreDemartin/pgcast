<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// The playground's editor (decision 005), on a computer, imported by Playground.vue alone: Monaco with TypeScript only,
// against the declarations of playground.data.ts. On each edit, the TypeScript worker emits the JavaScript, which
// playground/run.worker.ts runs against a pool that records each query; the panel shows their SQL and values, then
// the type of the code's first `const`, as a cast panel does (panel.ts). Run, a click or Ctrl+Enter, and never on its
// own, runs it on Postgres in the worker: the panel shows what Postgres answers each query.
// A link's code (`shared`, from Playground.vue) opens with its type and no SQL: it runs only on Run, or once edited.
// Share puts the code in the URL's fragment (playground/share.ts) and copies the link.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/typescript/register';
import {
  getTypeScriptWorker, ModuleKind, ModuleResolutionKind, typescriptDefaults,
} from 'monaco-editor/languages/features/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';
// Monaco's own stylesheet, with its icon font, as one file: its modules' CSS imports are emptied (playground/build.ts).
// Both stylesheets come as text, put in by the editor: VitePress links the build's first CSS file on every page.
import monacoStyle from '../../node_modules/monaco-editor/min/vs/editor/editor.main.css?inline';
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
import { data as casts } from '../cast.data.ts';
import { hoverType, shown, typeShown } from '../panel.ts';
import { data } from '../playground.data.ts';
import { jsonHtml, sqlHtml, typeHtml } from '../playground/highlight.ts';
import type { Code, Message, Query, Run } from '../playground/run.worker.ts';
import { codeOf, fragmentOf, limit as shareLimit } from '../playground/share.ts';
import playgroundStyle from './playground.css?inline';

const { shared } = defineProps<{ shared?: string | null }>();  // a link's code; `null`: a link that cannot be read

const
  start = casts['first-query']!,  // the panel computed at build from the same code, until the first run
  host = useTemplateRef<HTMLDivElement>('host'),
  queries = shallowRef<(Omit<Query, 'sql'> & { html: string })[]>([{ html: start.sql, values: start.values }]),
  notes = shallowRef<string[]>([]),
  notice = shallowRef<string>(),  // about a link, until the next run
  linkNotices = {
    opened: 'This code comes from a link: it runs only when you press Run, or once you edit it.',
    broken: `This link's code could not be read (damaged, or over ${shareLimit / 1000} KB), so here is the tutorial's first query.`,
  },
  type = shallowRef(start.type),
  limit = 10_000,  // ms, as run-examples.mjs gives each example
  // set once Postgres has started in this browser: its files are then in the browser's cache, and the download note
  // goes (a cleared cache downloads them again, without the note)
  startedKey = 'pgcast-playground-postgres',
  fontFamily = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

let
  editor: monaco.editor.IStandaloneCodeEditor | undefined, latest = 0, stop = () => {},
  runOnPostgres = () => {}, share = () => {},  // once the editor is made
  started = false;  // Postgres, in this page
const disposables: monaco.IDisposable[] = [];

self.MonacoEnvironment = {
  getWorker: (_, label) => ['typescript', 'javascript'].includes(label) ? new TypeScriptWorker() : new EditorWorker(),
};

typescriptDefaults.setCompilerOptions({
  target: 9,  // ES2022, which Monaco's enum does not name
  module: ModuleKind.ESNext,  // a top-level await, as in the docs' examples
  moduleResolution: ModuleResolutionKind.NodeJs,  // `zapatos/db` and `pg` from file:///node_modules/, as in a project
  esModuleInterop: true,  // `import type pg from 'pg'`, as the docs' `module: preserve` allows
  strict: true,
});
// errors and warnings, not the hints a page's examples never show (an unused `const` faded)
typescriptDefaults.setDiagnosticsOptions({ noSuggestionDiagnostics: true });
typescriptDefaults.setExtraLibs(Object.entries(data.libs).map(([filePath, content]) => ({ filePath, content })));

/** A Monaco theme from the tokens of style.css, light or dark as the page is now. */
function defineTheme() {
  const
    style = getComputedStyle(document.documentElement),
    // `#rrggbb`: the build minifies `#ffffff` to `#fff`, which Monaco refuses
    token = (name: string) => style.getPropertyValue(`--${name}`).trim().replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3'),
    // a rule's colour is written without its `#`
    rule = (scope: string, colour: string) => ({ token: scope, foreground: token(colour).slice(1) });

  monaco.editor.defineTheme('pgcast', {
    base: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      rule('', 'fg'), rule('comment', 'c'), rule('keyword', 'k'), rule('string', 's'), rule('regexp', 's'),
      rule('number', 'n'), rule('type', 't'), rule('delimiter', 'fg'), rule('identifier', 'fg'),
    ],
    colors: {
      'editor.background': token('surface'),
      'editor.foreground': token('fg'),
      'editorCursor.foreground': token('accent'),
      'editor.selectionBackground': token('accent-soft'),
      'editor.inactiveSelectionBackground': token('sunken'),
      'editorWidget.background': token('surface'),
      'editorWidget.foreground': token('fg'),
      'editorWidget.border': token('line'),
      'editorHoverWidget.background': token('surface'),
      'editorHoverWidget.border': token('line'),
      'editorSuggestWidget.background': token('surface'),
      'editorSuggestWidget.border': token('line'),
      'editorSuggestWidget.selectedBackground': token('accent-soft'),
      'editorSuggestWidget.highlightForeground': token('accent'),
      'focusBorder': token('accent'),
      // brackets are punctuation (syntax.ts), not a colour per pair
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`editorBracketHighlight.foreground${n}`, token('fg')])),
    },
  });
  monaco.editor.setTheme('pgcast');
}

const stylesheet = Object.assign(document.createElement('style'), { textContent: monacoStyle + playgroundStyle });

/**
 * The reader's code, emitted as JavaScript, run in a fresh worker; the run before it is stopped. On Postgres, the time
 * limit starts once Postgres is up: its download, the first time, is not the code's time.
 */
function run(js: string, postgres: boolean) {
  stop();
  const worker = new Worker(new URL('../playground/run.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Run | undefined>(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const
      stopped = `Stopped after ${limit / 1000} s: the code was still running.`,
      time = () => { timer = setTimeout(() => done({ queries: [], warnings: [], error: stopped }), limit); },
      done = (result?: Run) => { clearTimeout(timer); worker.terminate(); resolve(result); };
    stop = done;
    worker.onmessage = ({ data }: MessageEvent<Message>) => {
      if (!('started' in data)) return done(data);
      started = true;
      time();
      try { localStorage.setItem(startedKey, ''); } catch { /* no storage: the note shows again after a reload */ }
    };
    worker.onerror = event => done({ queries: [], warnings: [], error: event.message });
    worker.postMessage({ js, postgres } satisfies Code);
    if (!postgres) time();
  });
}

/** Whether Postgres has started in this page, or in this browser before. */
function startedBefore() {
  try {
    return started || localStorage.getItem(startedKey) !== null;
  } catch {
    return started;
  }
}

/** Monaco's TypeScript worker, once its language is set up, a moment after the first model asks for it. */
async function typescript() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getTypeScriptWorker();
    } catch (error) {  // "TypeScript not registered!"
      if (attempt === 100) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/** The type and the SQL of `code`, and on Postgres what it answers; with `runs` false, its type alone. */
async function update(code: string, types: monaco.editor.ITextModel, postgres = false, runs = true) {
  const
    version = ++latest,
    name = /^const (\w+) =/m.exec(code)?.[1],  // as cast.data.ts
    uri = editor!.getModel()!.uri,
    client = await (await typescript())(uri, types.uri),
    hover = async (at: monaco.Uri, offset: number) => hoverType((await client.getQuickInfoAtPosition(at.toString(), offset))
      ?.displayParts?.map((part: { text: string }) => part.text).join('') ?? '');

  if (postgres) notes.value = [startedBefore() ? 'Running on Postgres…' :
    'Starting Postgres in this page: about 5 MB to download, the first time…'];
  if (name) types.setValue(code + shown(name));
  const
    [emitted, named, expanded] = await Promise.all([
      client.getEmitOutput(uri.toString()),
      name && hover(uri, code.search(new RegExp(`^const ${name} =`, 'm')) + 'const '.length),
      name && hover(types.uri, types.getValue().lastIndexOf('declare const shown') + 'declare const '.length),
    ]);
  if (version !== latest) return;
  type.value = typeHtml(name && named && expanded ? typeShown(name, named, expanded) :
    '// no `const <name> = …` to give the type of');
  if (!runs) return;

  const result = await run(emitted.outputFiles[0]?.text ?? '', postgres);
  if (version !== latest || !result) return;
  queries.value = result.queries.map(({ sql, rows, ...query }) =>
    ({ ...query, html: sqlHtml(sql), rows: rows && jsonHtml(rows) }));
  notes.value = [
    ...result.error === undefined ? [] : [result.queries.length && !postgres ?
      `No rows come back as you type, so the code stopped after its query (Run gives it Postgres): ${result.error}` :
      result.error],
    ...result.queries.length || result.error !== undefined ? [] : ['This code sends no query.'],
    ...result.warnings,
  ];
}

onMounted(async () => {
  document.head.append(stylesheet);
  // registered before the wait: leaving during it takes the stylesheet away, and the editor is not made
  disposables.push({ dispose: () => stylesheet.remove() });
  await document.fonts.load(`13px ${fontFamily}`);
  if (!host.value) return;
  defineTheme();
  const
    model = monaco.editor.createModel(data.code, 'typescript', monaco.Uri.parse('file:///playground.ts')),
    types = monaco.editor.createModel('', 'typescript', monaco.Uri.parse('file:///playground-type.ts')),
    observer = new MutationObserver(defineTheme),  // VitePress's `.dark` on <html>
    // hovers and suggestions, out of the panel, which clips its corners (and is a container: no `position: fixed`)
    overflow = Object.assign(document.createElement('div'), { className: 'monaco-editor Playground-overflow' });

  document.body.append(overflow);

  // as a code block of the docs: no line numbers, no guides
  editor = monaco.editor.create(host.value!, {
    model, theme: 'pgcast',
    // Monaco's own binding (toggleTabFocusMode): Tab indents until it is pressed
    ariaLabel: 'The query, in TypeScript: edit it to update its SQL and its type; Ctrl+Enter, or Command+Enter on a ' +
      'Mac, runs it on Postgres. Tab indents; Ctrl+M, or Ctrl+Shift+M on a Mac, makes Tab move focus out of the editor',
    fontFamily, fontSize: 13, lineHeight: 21, tabSize: 2,
    lineNumbers: 'off', glyphMargin: false, folding: false, lineDecorationsWidth: 16, padding: { top: 14, bottom: 14 },
    minimap: { enabled: false }, overviewRulerLanes: 0, hideCursorInOverviewRuler: true, renderLineHighlight: 'none',
    guides: { indentation: false }, stickyScroll: { enabled: false }, scrollBeyondLastLine: false,
    // a line too long wraps 2ch further in, as in a cast panel: no line is cut
    wordWrap: 'on', wrappingIndent: 'indent', scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
    automaticLayout: true, fixedOverflowWidgets: true, overflowWidgetsDomNode: overflow,
  });
  observer.observe(document.documentElement, { attributeFilter: ['class'] });

  let
    timer: ReturnType<typeof setTimeout> | undefined,
    quiet = false;  // a link's code put in: not an edit
  const
    refresh = (postgres = false, runs = true) => {
      clearTimeout(timer);  // an edit not yet updated is part of this run
      notice.value = undefined;
      update(model.getValue(), types, postgres, runs).catch(error => { notes.value = [String(error)]; });
    },
    // a link's code, its type alone until Run; or, if it cannot be read, the tutorial's first query, run as ever
    open = (code: string | null) => {
      stop();
      quiet = true;
      model.setValue(code ?? data.code);
      quiet = false;
      if (code !== null) {
        queries.value = [];
        notes.value = [];
      }
      refresh(false, code === null);
      notice.value = linkNotices[code === null ? 'broken' : 'opened'];
    },
    // a link pasted in the address bar of this page: no reload, a `hashchange`; a heading's `#…` is not a link
    onHashChange = async () => {
      const code = await codeOf(location.hash);
      if (code !== undefined && host.value) open(code);
    };
  runOnPostgres = () => refresh(true);
  share = async () => {
    const link = await fragmentOf(model.getValue());
    if (!host.value) return;
    if (!link) {
      notice.value = `Too long to share: a link holds ${shareLimit / 1000} KB of code at most.`;
      return;
    }
    history.replaceState(history.state, '', link);  // VitePress's state kept: its `popstate` ignores a `null` one
    try {
      await navigator.clipboard.writeText(location.href);
      notice.value = 'Link copied: it opens this code, which runs only when its reader presses Run.';
    } catch {
      notice.value = 'The link is in the address bar: copy it from there.';
    }
  };
  addEventListener('hashchange', onHashChange);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runOnPostgres);
  disposables.push(model, types, editor, { dispose: () => { runOnPostgres = share = () => {}; } },
    { dispose: () => {
      clearTimeout(timer); observer.disconnect(); overflow.remove(); removeEventListener('hashchange', onHashChange);
    } },
    editor.onDidContentSizeChange(({ contentHeight }) => { host.value!.style.height = `${contentHeight}px`; }),
    model.onDidChangeContent(() => {
      if (quiet) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    }));
  host.value!.style.height = `${editor.getContentHeight()}px`;
  if (shared === undefined) refresh();
  else open(shared);
});

onBeforeUnmount(() => { stop(); latest++; disposables.forEach(disposable => disposable.dispose()); });
</script>

<template>
  <div class="CastPanel-frame">
    <div class="CastPanel Playground" role="group" aria-label="What you write, what Postgres runs, what TypeScript knows">
      <div>
        <p class="label"><em>TS</em>You write</p>
        <div ref="host" class="Playground-editor" />
      </div>
      <div aria-live="polite">
        <p class="label">
          <em>SQL</em>Postgres runs
          <button type="button" class="Playground-run" @click="runOnPostgres()">Run</button>
          <button type="button" class="Playground-share" @click="share()">Share</button>
        </p>
        <template v-for="(query, i) in queries" :key="i">
          <div v-html="query.html" />
          <p class="values">values <b>{{ query.values }}</b></p>
          <p v-if="query.answer" class="values">returns <b>{{ query.answer }}</b></p>
          <div v-if="query.rows" v-html="query.rows" />
          <p v-if="query.rejects" class="values">
            rejects<template v-if="query.rejects.code"> with <b>{{ query.rejects.code }}</b></template>:
            {{ query.rejects.message }}
          </p>
        </template>
        <p v-if="notice" class="Playground-note">{{ notice }}</p>
        <p v-for="note in notes" :key="note" class="Playground-note">{{ note }}</p>
      </div>
      <div aria-live="polite">
        <p class="label"><em>::</em>TypeScript knows</p>
        <div v-html="type" />
      </div>
    </div>
  </div>
</template>
