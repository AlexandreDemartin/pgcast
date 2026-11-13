// Copyright (C) 2026 Alexandre Demartin
// The home's loop, computed at build: a column changes (loop/alter.sql), the schema pgcast generates after it changes
// (loop/zapatos/schema.d.ts, written by `npm run docs:schema`), and the compiler flags the query that broke
// (loop/films.ts), with the error Twoslash gives it against that schema. The query must compile against the docs
// schema, and give exactly the errors its `// @errors` lists against the loop's: otherwise the build fails.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTwoslasher } from 'twoslash';
import { createMarkdownRenderer, defineLoader } from 'vitepress';
import { lineIndents, markLines, sqlParameters, syntax } from './syntax.ts';
import { twoslashOptions } from './twoslash.ts';

export interface Loop {
  alter: string;  // highlighted HTML
  diff: string;  // highlighted HTML: the table's Selectable, its changed lines marked `del` and `ins`
  query: string;  // highlighted HTML: the code the error is in marked `error`
  errors: { at: string; code: string; text: string }[];  // as tsc writes them: `src/films.ts:2:15`, `TS18047`
}

declare const data: Loop;
export { data };

const
  read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
  // Twoslash resolves `zapatos/schema` from its `vfsRoot` too, its `baseUrl`: the loop's root is loop/, so that the
  // new schema is the only one it sees
  newSchema = createTwoslasher({
    ...twoslashOptions,
    vfsRoot: fileURLToPath(new URL('../loop', import.meta.url)),
    extraFiles: { ...twoslashOptions.extraFiles, 'zapatos-schema.d.ts': read('loop/zapatos/schema.d.ts') },
  }),
  entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" },
  escaped = (text: string) => text.replace(/[&<>"']/g, c => Object.keys(entities).find(e => entities[e] === c)!);

/** Shiki's HTML of `code`, the code from `start` to `end` in `<span class="error">`: tsc's underline. */
function markError(html: string, start: number, end: number) {
  const [head, rest] = html.split(/(?<=<code>)/), [code, tail] = rest!.split(/(?=<\/code>)/);
  let at = 0;
  return head + code!.replace(/(?<=>)[^<]+(?=<)/g, escapedText => {
    const
      text = escapedText.replace(/&(?:amp|lt|gt|quot|#39);/g, e => entities[e]!),
      [from, to] = [Math.max(start - at, 0), Math.min(end - at, text.length)];
    at += text.length;
    return from >= to ? escapedText : escaped(text.slice(0, from)) + `<span class="error">${escaped(text.slice(from, to))}</span>` +
      escaped(text.slice(to));
  }) + tail;
}

export default defineLoader({
  watch: ['../loop/*', '../loop/zapatos/schema.d.ts', '../zapatos/schema.d.ts'],
  async load() {
    const
      md = await createMarkdownRenderer(process.cwd(), { theme: syntax, codeTransformers: [sqlParameters, lineIndents] }),
      highlight = (code: string, lang: string) => md.renderAsync('```' + lang + '\n' + code + '\n```'),
      alter = read('loop/alter.sql').replace(/^--.*\n/gm, '').trim(),
      table = /^ALTER TABLE (\w+)/m.exec(alter)?.[1],
      source = read('loop/films.ts'),
      [before, after] = [read('zapatos/schema.d.ts'), read('loop/zapatos/schema.d.ts')].map(file => file.split('\n')),
      namespace = after.indexOf(`  export namespace ${table} {`),
      changed = after.flatMap((line, i) => line === before[i] ? [] : [i]);

    // the loop's schema is the docs schema but for the table that loop/alter.sql changes: one regenerated with the other
    if (!table || before.length !== after.length || changed.length === 0 ||
      changed.some(i => i < namespace || after.indexOf('  }', namespace) < i))
      throw new Error(`loop.data.ts: loop/zapatos/schema.d.ts is not zapatos/schema.d.ts with ${table ?? 'a table'} ` +
        'changed by loop/alter.sql (an ALTER TABLE that keeps its lines): run `npm run docs:schema`');

    const
      start = after.indexOf('    export interface Selectable {', namespace),
      end = after.indexOf('    }', start),
      fields = changed.filter(i => start < i && i < end && !/^\s*(\/\*\*|\*)/.test(after[i]!)),
      diff = [after[namespace], after[start], ...fields.flatMap(i => [before[i], after[i]])].map(line => line!.slice(2));

    // the query compiles on the docs schema, and on the loop's gives exactly the errors its `// @errors` lists
    const
      unchecked = { handbookOptions: { noErrorValidation: true } },
      onDocsSchema = createTwoslasher(twoslashOptions)(source, 'ts', unchecked).errors,
      { code, errors } = newSchema(source, 'ts', unchecked),
      listed = /^\/\/ @errors: ([\d ]+)$/m.exec(source)?.[1]!.split(' ') ?? [],
      codes = (list: { code: number }[]) => `[${list.map(e => e.code).join(', ')}]`;
    if (onDocsSchema.length > 0 || errors.length === 0 || codes(errors) !== `[${listed.join(', ')}]`)
      throw new Error(`loop.data.ts: loop/films.ts gave the errors ${codes(onDocsSchema)} on the docs schema and ` +
        `${codes(errors)} on the loop's, not none and the [${listed.join(', ')}] of its \`// @errors\``);

    return {
      alter: await highlight(alter, 'sql'),
      // after the namespace and interface lines, each field as it was, then as it is
      diff: markLines(await highlight(diff.join('\n'), 'ts'), n => ({ class: n < 3 ? '' : n % 2 ? 'del' : 'ins' })),
      query: errors.reduce((html, e) => markError(html, e.start, e.start + e.length), await highlight(code.trimEnd(), 'ts')),
      errors: errors.map(e => ({ at: `src/films.ts:${e.line + 1}:${e.character + 1}`, code: `TS${e.code}`, text: String(e.text) })),
    };
  },
});
