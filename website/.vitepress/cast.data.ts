// Copyright (C) 2026 Alexandre Demartin
// The SQL and the type of each cast panel, computed at build from its example (examples/<name>.ts), never typed by
// hand. Each example runs once against a pool that only records: what it records is the `{ text, values }` that the
// query's `.run()` gets from `.compile()`. The type is the one Twoslash gives the example's first `const`.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTwoslasher } from 'twoslash';
import { createMarkdownRenderer, defineLoader } from 'vitepress';
import { sqlParameters, syntax } from './syntax.ts';
import { twoslashOptions } from './twoslash.ts';

export interface Cast {
  sql: string;  // highlighted HTML
  values: string;
  type: string;  // highlighted HTML
}

declare const data: Record<string, Cast>;
export { data };

// The row type, one level deep, rather than the `LateralResult<…>` and the like that a hover shows.
const shown = (name: string) => `
type Shown<T> = T extends readonly (infer R)[] ? { [K in keyof R]: R[K] }[] : T extends object ? { [K in keyof T]: T[K] } : T;
declare const shown: Shown<typeof ${name}>;
`;

export default defineLoader({
  watch: ['../examples/*.ts', '../zapatos/schema.d.ts'],
  async load(files) {
    const
      md = await createMarkdownRenderer(process.cwd(), { theme: syntax, codeTransformers: [sqlParameters] }),
      highlight = (code: string, lang: string) => md.renderAsync('```' + lang + '\n' + code + '\n```'),
      twoslasher = createTwoslasher(twoslashOptions),
      sent: { text: string; values: unknown[] }[] = [],
      casts: Record<string, Cast> = {};

    (globalThis as any).pool = { query: async (query: typeof sent[number]) => { sent.push(query); return { rows: [] }; } };

    for (const file of files.filter(f => !f.endsWith('.d.ts'))) {
      const
        name = basename(file, '.ts'),
        source = readFileSync(file, 'utf8'),
        result = /^const (\w+)/m.exec(source.split('// ---cut---')[1] ?? '')?.[1];

      if (!result) throw new Error(`examples/${name}.ts: no \`const\` after \`// ---cut---\` to give the type of`);

      sent.length = 0;
      await import(`${pathToFileURL(file)}?${Date.now()}`);  // a fresh run on each change, in dev
      if (sent.length !== 1) throw new Error(`examples/${name}.ts: ran ${sent.length} queries, not 1`);

      const
        [{ text, values }] = sent,
        hover = twoslasher(source + shown(result), 'ts').nodes.find(n => n.type === 'hover' && n.target === 'shown');

      if (!hover || hover.type !== 'hover') throw new Error(`examples/${name}.ts: Twoslash gave no type for \`${result}\``);

      casts[name] = {
        sql: await highlight(layOut(text), 'sql'),
        values: '[' + values.map(value => JSON.stringify(value)).join(', ') + ']',
        type: await highlight(hover.text.replace(/^const shown/, `const ${result}`).replace(/^((?: {4})+)/gm, s => s.slice(s.length / 2)), 'ts'),
      };
    }
    return casts;
  },
});

/**
 * Lay out compiled SQL on lines, as you'd write it: each clause on its own line, each subquery indented. Only the
 * whitespace between tokens changes, never inside a quoted string or identifier, so it is the same query.
 */
function layOut(sql: string) {
  const
    subqueries: boolean[] = [],  // for each open parenthesis: does it hold a subquery?
    indent = (extra = 0) => '\n' + '  '.repeat(subqueries.filter(Boolean).length + extra),
    atClauseLevel = () => subqueries.length === 0 || subqueries[subqueries.length - 1]!,
    tokens = /(\((?=SELECT\b))|(\()|(\))|((?<!LEFT|INNER)\s+(?=(?:FROM|WHERE|(?:LEFT |INNER )?JOIN|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|VALUES|ON CONFLICT|RETURNING)\b))|(?<=\|\|)\s+/g;

  return sql.split(/('(?:[^']|'')*'|"(?:[^"]|"")*")/)  // odd parts are quoted: kept as they are
    .map((part, i) => i % 2 ? part : part.replace(tokens, (space, subquery, open, close, beforeClause) =>
      subquery ? (subqueries.push(true), '(' + indent()) :
      open ? (subqueries.push(false), '(') :
      close ? (subqueries.pop() ? indent() + ')' : ')') :
      !atClauseLevel() ? space :
      beforeClause ? indent() :
      indent(1)))  // after a top-level ||
    .join('');
}
