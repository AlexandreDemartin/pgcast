// Copyright (C) 2026 Alexandre Demartin
// What a cast panel shows, from a query and a hover: at build (cast.data.ts), and in the playground's page as you type
// (theme/PlaygroundEditor.vue). So both lay out the SQL and give the type alike.

const
  quoted = /('(?:[^']|'')*'|"(?:[^"]|"")*"|--.*)/,  // a SQL string, a quoted identifier, or a comment to its line's end
  /**
   * The SQL with `f` applied to each part outside quotes and comments, once each run of its whitespace is one space,
   * or a line break after a comment, which would otherwise run on.
   */
  outsideQuotes = (sql: string, f: (part: string) => string) => sql.split(quoted)
    .map((part, i, parts) => i % 2 ? part :
      f(part.replace(/\s+/g, (_, at: number) => at === 0 && parts[i - 1]?.startsWith('--') ? '\n' : ' ')))
    .join('').trim();

/** The SQL with its whitespace made uniform outside quotes: what `layOut` must leave as it is. */
export const normalised = (sql: string) => outsideQuotes(sql, part => part.replace(/ ?([()]) ?/g, '$1'));

/**
 * Lay out compiled SQL on lines, as you'd write it: each clause on its own line, each subquery indented, whatever the
 * spacing of the template it came from. Only the whitespace between tokens changes, never inside a `'…'` string, a
 * `"…"` identifier or a `--` comment, so it is the same query.
 */
export function layOut(sql: string) {
  const
    subqueries: boolean[] = [],  // for each open parenthesis: does it hold a subquery?
    indent = (extra = 0) => '\n' + '  '.repeat(subqueries.filter(Boolean).length + extra),
    atClauseLevel = () => subqueries.length === 0 || subqueries[subqueries.length - 1]!,
    tokens = /(\((?=SELECT\b))|(\()|(\))|((?<!LEFT|INNER)\s+(?=(?:SELECT|FROM|WHERE|(?:LEFT |INNER )?JOIN|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|FOR (?:NO KEY )?UPDATE|FOR (?:KEY )?SHARE|VALUES|ON CONFLICT|RETURNING)\b))|(?<=\|\|)\s+/g;

  // no space inside a parenthesis, as compiled SQL writes it: `( SELECT` opens a subquery too
  return outsideQuotes(sql, part => part.replace(/\( | \)/g, paren => paren.trim())
    .replace(tokens, (space, subquery, open, close, beforeClause) =>
      subquery ? (subqueries.push(true), '(' + indent()) :
      open ? (subqueries.push(false), '(') :
      close ? (subqueries.pop() ? indent() + ')' : ')') :
      !atClauseLevel() ? space :
      beforeClause ? indent() :
      indent(1)));  // after a top-level ||
}

/** A query's values, as its panel shows them under its SQL: `["The Salt Orchard"]`. */
export const valuesShown = (values: unknown[]) => '[' + values.map(value => JSON.stringify(value)).join(', ') + ']';

// The row type, one level deep, under the named type that a hover shows (`films.JSONSelectable`, `LateralResult<…>`):
// code appended to the example's, whose own hover is that of `shown`.
export const shown = (name: string) => `
type Shown<T> = T extends readonly (infer R)[] ? { [K in keyof R]: R[K] }[] : T extends object ? { [K in keyof T]: T[K] } : T;
declare const shown: Shown<typeof ${name}>;
`;

/**
 * The `const` whose type the playground gives: its code's first with no type written, as a cast panel's
 * (cast.data.ts), or the first after a line `// the playground gives the type of the next const`, which an example
 * that runs a query above its cut writes there (examples/paginate_keyset.ts).
 */
export const typedConst = (code: string) =>
  /^const (\w+) =/m.exec(code.split(/^\/\/ the playground gives the type of the next const$/m).at(-1)!)?.[1];

/** The type in a hover of `const <name>`, without `const <name>: `; nested lines are indented by 2, not 4. */
export const hoverType = (text: string) =>
  text.replace(/^const \w+: /, '').replace(/^((?: {4})+)/gm, s => s.slice(s.length / 2));

/** "TypeScript knows": the type of `const <name>` by its name, then one level down if that reads differently. */
export const typeShown = (name: string, named: string, expanded: string) =>
  `const ${name}: ${named}` + (expanded === named ? '' : `\n// that is\nconst ${name}: ${expanded}`);
