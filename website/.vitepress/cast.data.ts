// Copyright (C) 2026 Alexandre Demartin
// The SQL and the type of each cast panel, computed at build from its example (examples/<name>.ts), never typed by
// hand. Each example runs once against a pool that only records: what it records is the `{ text, values }` that the
// query's `.run()` gets from `.compile()`. The type is the one Twoslash gives the example's first `const`: its name,
// then one level down.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTwoslasher } from 'twoslash';
import { createMarkdownRenderer, defineLoader } from 'vitepress';
import * as db from 'zapatos/db';
import { sqlParameters, syntax } from './syntax.ts';
import { twoslashOptions } from './twoslash.ts';

export interface Cast {
  sql: string;  // highlighted HTML
  values: string;
  type: string;  // highlighted HTML
}

declare const data: Record<string, Cast>;
export { data };

// The row type, one level deep, under the named type that a hover shows (`films.JSONSelectable`, `LateralResult<…>`).
const shown = (name: string) => `
type Shown<T> = T extends readonly (infer R)[] ? { [K in keyof R]: R[K] }[] : T extends object ? { [K in keyof T]: T[K] } : T;
declare const shown: Shown<typeof ${name}>;
`;

const
  sent: { text: string; values: unknown[] }[] = [],
  pool = { query: async (query: typeof sent[number]) => { sent.push(query); return { rows: [] }; } } as any;

/**
 * The one query that `run` sends to the pool. With no rows to give back, a shortcut that expects one (a single-row
 * `insert`, `count`, `selectExactlyOne`) throws once its query is recorded: that throw is expected, and ignored.
 * An example may call `db.setConfig()`: every example shares this process's `zapatos/db`, so the configuration goes
 * back to what it was, each key the example added unset, before the next one runs. `getConfig()` copies one level
 * only, so `transactionRetryDelay` is copied by value: an example may change it in place.
 */
async function record(run: () => Promise<unknown>, what: string) {
  const config = db.getConfig();
  config.transactionRetryDelay = { ...config.transactionRetryDelay };
  sent.length = 0;
  try {
    await run().catch(error => { if (sent.length !== 1) throw error; });
  } finally {
    db.setConfig({ ...Object.fromEntries(Object.keys(db.getConfig()).map(key => [key, undefined])), ...config });
  }
  if (sent.length !== 1) throw new Error(`${what}: ran ${sent.length} queries, not 1`);
  return sent[0]!;
}

export default defineLoader({
  watch: ['../examples/*.ts', '../zapatos/schema.d.ts'],
  async load(files) {
    const
      md = await createMarkdownRenderer(process.cwd(), { theme: syntax, codeTransformers: [sqlParameters] }),
      highlight = (code: string, lang: string) => md.renderAsync('```' + lang + '\n' + code + '\n```'),
      twoslasher = createTwoslasher(twoslashOptions),
      casts: Record<string, Cast> = {};

    // Self-checks: each guards against a panel that would show something untrue and still build.
    if (!throws(() => twoslasher('const n: number = ""', 'ts')))
      throw new Error('cast.data.ts: Twoslash let a type error through: check `vfsRoot` in twoslash.ts');
    const sameName = "import type * as s from 'zapatos/schema';\nconst cinemas: s.cinemas.Selectable[] = [];";
    if (typeOf(twoslasher(sameName, 'ts').nodes, 'cinemas') !== 's.cinemas.Selectable[]')
      throw new Error('cast.data.ts: a panel took the type of another `cinemas` than the `const`: check `typeOf`');
    for (const [what, query] of [
      ['a single-row insert', db.insert('tags', { film_id: 1000, tag: 'coastal' })],
      ['count', db.count('films', db.all)],
      ['selectExactlyOne', db.selectExactlyOne('films', { id: 1000 })],
    ] as const) await record(() => query.run(pool), `cast.data.ts, the recording pool given ${what}`);
    const before = JSON.stringify(db.getConfig());
    await record(() => {
      db.getConfig().transactionRetryDelay.minMs = -1;
      db.setConfig({ castArrayParamsToJson: true, queryListener: () => {} });
      return db.sql`SELECT 1`.run(pool);
    }, 'cast.data.ts, an example that changes the configuration');
    if (JSON.stringify(db.getConfig()) !== before || db.getConfig().queryListener)
      throw new Error('cast.data.ts: an example left the configuration changed for the next: check `record`');

    for (const file of files.filter(f => !f.endsWith('.d.ts'))) {
      const { sql, values, type } = await castOf(file, twoslasher);
      casts[basename(file, '.ts')] = { sql: await highlight(sql, 'sql'), values, type: await highlight(type, 'ts') };
    }
    return casts;
  },
});

/**
 * What the cast panel of `file` (examples/<name>.ts) shows, as plain text: its SQL laid out on lines, its values, and
 * its type. Also read by llms.ts, for llms-full.txt.
 */
export async function castOf(file: string, twoslasher: ReturnType<typeof createTwoslasher>) {
  const
    name = basename(file, '.ts'),
    source = readFileSync(file, 'utf8'),
    result = /^const (\w+)/m.exec(source.split('// ---cut---')[1] ?? '')?.[1];

  if (!result) throw new Error(`examples/${name}.ts: no \`const\` after \`// ---cut---\` to give the type of`);

  (globalThis as any).pool = pool;
  const
    run = () => import(`${pathToFileURL(file)}?${Date.now()}`),  // a fresh run on each change, in dev
    { text, values } = await record(run, `examples/${name}.ts`),
    sql = layOut(text),
    hovers = twoslasher(source + shown(result), 'ts').nodes,
    [named, expanded] = [typeOf(hovers, result), typeOf(hovers, 'shown')];

  if (normalised(sql) !== normalised(text)) throw new Error(`examples/${name}.ts: layOut changed more than whitespace`);
  if (!named || !expanded) throw new Error(`examples/${name}.ts: Twoslash gave no type for \`${result}\``);

  return {
    sql,
    values: '[' + values.map(value => JSON.stringify(value)).join(', ') + ']',
    type: `const ${result}: ${named}` + (expanded === named ? '' : `\n// that is\nconst ${result}: ${expanded}`),
  };
}

/**
 * The type of `const <name>`, from its hover: never from another hover on the same name, which may come first
 * (the namespace `s.cinemas` before `const cinemas`). Nested lines are indented by 2, not 4.
 */
const typeOf = (hovers: ReturnType<ReturnType<typeof createTwoslasher>>['nodes'], name: string) => hovers
  .find(n => n.type === 'hover' && n.target === name && n.text.startsWith(`const ${name}: `))?.text
  .replace(/^const \w+: /, '').replace(/^((?: {4})+)/gm, s => s.slice(s.length / 2));

const throws = (f: () => unknown) => { try { f(); } catch { return true; } return false; };

const quoted = /('(?:[^']|'')*'|"(?:[^"]|"")*")/;  // a SQL string or quoted identifier

/** The SQL with its whitespace made uniform outside quotes: what `layOut` must leave as it is. */
const normalised = (sql: string) => sql.split(quoted)
  .map((part, i) => i % 2 ? part : part.replace(/\s+/g, ' ').replace(/ ?([()]) ?/g, '$1')).join('').trim();

/**
 * Lay out compiled SQL on lines, as you'd write it: each clause on its own line, each subquery indented. Only the
 * whitespace between tokens changes, never inside a quoted string or identifier, so it is the same query.
 */
function layOut(sql: string) {
  const
    subqueries: boolean[] = [],  // for each open parenthesis: does it hold a subquery?
    indent = (extra = 0) => '\n' + '  '.repeat(subqueries.filter(Boolean).length + extra),
    atClauseLevel = () => subqueries.length === 0 || subqueries[subqueries.length - 1]!,
    tokens = /(\((?=SELECT\b))|(\()|(\))|((?<!LEFT|INNER)\s+(?=(?:SELECT|FROM|WHERE|(?:LEFT |INNER )?JOIN|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|FOR (?:NO KEY )?UPDATE|FOR (?:KEY )?SHARE|VALUES|ON CONFLICT|RETURNING)\b))|(?<=\|\|)\s+/g;

  return sql.split(quoted)  // odd parts are quoted: kept as they are
    .map((part, i) => i % 2 ? part : part.replace(tokens, (space, subquery, open, close, beforeClause) =>
      subquery ? (subqueries.push(true), '(' + indent()) :
      open ? (subqueries.push(false), '(') :
      close ? (subqueries.pop() ? indent() + ')' : ')') :
      !atClauseLevel() ? space :
      beforeClause ? indent() :
      indent(1)))  // after a top-level ||
    .join('');
}
