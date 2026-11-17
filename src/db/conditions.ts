/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import type { JSONObject, JSONValue } from './core';
import {
  SQLFragment,
  ParentColumn,
  Parameter,
  DangerousRawString,
  ColumnNames,
  ColumnValues,
  param,
  sql,
  SQL,
  self,
  vals,
  Default,
  all,
  raw,
  AllType,
} from './core';

import { callerValue, mapWithSeparator } from './utils';
import type { Whereable, Table, Column, WhereableForTable, SelectableForTable } from 'zapatos/schema';

const
  defaultInCondition = '`db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`.',
  selfInCondition = '`db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides.',
  wrapperInCondition = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`.';

// a fragment that throws when compiled, so that `run()` rejects before any query, as for `Default` in a
// Whereable, rather than the condition throwing while the query is built; 6.6.1 sent 'Symbol(DEFAULT)', and
// raw(), cols() and vals() as JSON
const refused = (message: string) => Object.assign(sql``, { compile: () => { throw new Error(message); } });

const conditionalParam = (a: any) =>
  a === Default ? refused(defaultInCondition) :
    a === self ? refused(selfInCondition) :
      a instanceof DangerousRawString || a instanceof ColumnNames || a instanceof ColumnValues ? refused(wrapperInCondition) :
        a instanceof SQLFragment || a instanceof ParentColumn || a instanceof Parameter ? a : param(a);

export const isNull = sql<SQL, boolean>`${self} IS NULL`;
export const isNotNull = sql<SQL, boolean>`${self} IS NOT NULL`;
/** `"col" IS TRUE`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isTrue = sql<SQL, boolean>`${self} IS TRUE`;
/** `"col" IS NOT TRUE`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isNotTrue = sql<SQL, boolean>`${self} IS NOT TRUE`;
/** `"col" IS FALSE`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isFalse = sql<SQL, boolean>`${self} IS FALSE`;
/** `"col" IS NOT FALSE`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isNotFalse = sql<SQL, boolean>`${self} IS NOT FALSE`;
/** `"col" IS UNKNOWN`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isUnknown = sql<SQL, boolean>`${self} IS UNKNOWN`;
/** `"col" IS NOT UNKNOWN`, for a `boolean` or a domain over one: on another type, Postgres refuses it (42804), which the type lets through. */
export const isNotUnknown = sql<SQL, boolean>`${self} IS NOT UNKNOWN`;

/**
 * `"col" IS DISTINCT FROM $1`: as `ne()`, with `NULL` a value like any other. It takes a nullable value,
 * `null` included, on any column: `null` leaves the column's constraint, the SQL stays the same.
 * @param a A value, `Parameter`, `parent()` or `sql` fragment
 */
export const isDistinctFrom = <T>(a: T) => sql<SQL, boolean, Exclude<T, null>>`${self} IS DISTINCT FROM ${conditionalParam(a)}`;
/**
 * `"col" IS NOT DISTINCT FROM $1`: as `eq()`, with `NULL` a value like any other. It takes a nullable value,
 * `null` included, on any column: `null` leaves the column's constraint, the SQL stays the same.
 * @param a A value, `Parameter`, `parent()` or `sql` fragment
 */
export const isNotDistinctFrom = <T>(a: T) => sql<SQL, boolean, Exclude<T, null>>`${self} IS NOT DISTINCT FROM ${conditionalParam(a)}`;

export const eq = <T>(a: T) => sql<SQL, boolean | null, T>`${self} = ${conditionalParam(a)}`;
export const ne = <T>(a: T) => sql<SQL, boolean | null, T>`${self} <> ${conditionalParam(a)}`;
export const gt = <T>(a: T) => sql<SQL, boolean | null, T>`${self} > ${conditionalParam(a)}`;
export const gte = <T>(a: T) => sql<SQL, boolean | null, T>`${self} >= ${conditionalParam(a)}`;
export const lt = <T>(a: T) => sql<SQL, boolean | null, T>`${self} < ${conditionalParam(a)}`;
export const lte = <T>(a: T) => sql<SQL, boolean | null, T>`${self} <= ${conditionalParam(a)}`;

export const between = <T>(a: T, b: T) => sql<SQL, boolean | null, T> `${self} BETWEEN (${conditionalParam(a)}) AND (${conditionalParam(b)})`;
export const betweenSymmetric = <T>(a: T, b: T) => sql<SQL, boolean | null, T> `${self} BETWEEN SYMMETRIC (${conditionalParam(a)}) AND (${conditionalParam(b)})`;
export const notBetween = <T>(a: T, b: T) => sql<SQL, boolean | null, T> `${self} NOT BETWEEN (${conditionalParam(a)}) AND (${conditionalParam(b)})`;
export const notBetweenSymmetric = <T>(a: T, b: T) => sql<SQL, boolean | null, T> `${self} NOT BETWEEN SYMMETRIC (${conditionalParam(a)}) AND (${conditionalParam(b)})`;

export const like = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} LIKE ${conditionalParam(a)}`;
export const notLike = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} NOT LIKE ${conditionalParam(a)}`;
export const ilike = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} ILIKE ${conditionalParam(a)}`;
export const notIlike = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} NOT ILIKE ${conditionalParam(a)}`;
export const similarTo = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} SIMILAR TO ${conditionalParam(a)}`;
export const notSimilarTo = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} NOT SIMILAR TO ${conditionalParam(a)}`;
export const reMatch = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} ~ ${conditionalParam(a)}`;
export const reImatch = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} ~* ${conditionalParam(a)}`;
export const notReMatch = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} !~ ${conditionalParam(a)}`;
export const notReImatch = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} !~* ${conditionalParam(a)}`;

// 6.6.1 read `a.length`, which an iterable lacks, so `isNotIn(new Set([1]))` compiled to `true`, every row; the
// refusal sits in the expressions, which copy() shares, so that a copied condition throws too; one value is wrapped,
// not spread, which would split a string into its characters again
const notAnArray = (fn: string, a: unknown) => sql`${refused(typeof a === 'object' && a !== null ?
  `\`${fn}()\` takes an array, not \`${Object.prototype.toString.call(a).slice(8, -1)}\`: make one with \`${fn}([...values])\`, or \`Array.from(values)\` for an array-like object.` :
  `\`${fn}()\` takes an array, not \`${a === null ? 'null' : typeof a}\`: for one value, write \`${fn}([value])\`.`)}`;

/**
 * `"col" IN ($1, $2)`, and `false` for an empty array. A list that is not an array (a `Set`, an
 * iterator) throws as the query compiles: spread it into one, `isIn([...values])`, or wrap one value, `isIn([value])`.
 * @param a An array of values, `Parameter`s, `parent()` or `sql` fragments
 */
export const isIn = <T>(a: readonly T[]) => !Array.isArray(a) ? notAnArray('isIn', a) : a.length > 0 ? sql<SQL, boolean | null, T>`${self} IN (${vals(a)})` : sql`false`;
/**
 * `"col" NOT IN ($1, $2)`, and `true`, every row, for an empty array. A list that is not an array
 * (a `Set`, an iterator) throws as the query compiles: spread it into one, `isNotIn([...values])`, or wrap one value,
 * `isNotIn([value])`.
 * @param a An array of values, `Parameter`s, `parent()` or `sql` fragments
 */
export const isNotIn = <T>(a: readonly T[]) => !Array.isArray(a) ? notAnArray('isNotIn', a) : a.length > 0 ? sql<SQL, boolean | null, T>`${self} NOT IN (${vals(a)})` : sql`true`;

// what eqAny() calls each value that is no plain value, for its messages; undefined for a plain value
const notAValue = (x: unknown) =>
  x === Default ? '`db.Default`' : x === self ? '`db.self`' : x instanceof Parameter ? '`db.param()`' :
    x instanceof ParentColumn ? '`db.parent()`' : x instanceof DangerousRawString ? '`db.raw()`' :
      x instanceof ColumnNames ? '`db.cols()`' : x instanceof ColumnValues ? '`db.vals()`' :
        x instanceof SQLFragment ? 'a `sql` fragment' : undefined;

// one array parameter holds plain values: pg would send a Parameter or a fragment as JSON, and read an array item
// as more items, so that a jsonb column matched no row, with no error
const anyArray = (a: unknown) => {
  if (!Array.isArray(a)) {
    const name = notAValue(a);
    return name === undefined ? notAnArray('eqAny', a) :
      refused(`\`eqAny()\` takes an array of values, not ${name}: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.`);
  }
  const
    i = a.findIndex(x => Array.isArray(x) || notAValue(x) !== undefined),
    item = a[i],
    name = notAValue(item);
  return i < 0 ? param(a, false) : refused(name === undefined ?
    '`eqAny()` sends its array as one parameter, which reads an array item as more items: on an array column, use `isIn()`; on a `jsonb` column, give the item as JSON text, `JSON.stringify(item)`.' :
    item instanceof Parameter || item instanceof SQLFragment || item instanceof ParentColumn ?
      `\`eqAny()\` sends its array as one parameter, so each item is a plain value, not ${name}: give the value itself, or use \`isIn()\`, which takes it.` :
      `\`eqAny()\` sends its array as one parameter, so each item is a plain value, not ${name}: give a value.`);
};

// parent() fixes no T, which the Whereable would then infer from the same key of every table (#493): `never` fits any;
// the signatures are written in place, not as an interface, so that a package built with `declaration: true` can
// re-export the condition (TS4023) with no type name more in db.conditions
/**
 * `"col" = ANY($1)`, the whole array one parameter: one query text for any length, where `isIn()` writes
 * `IN ($1, $2, …)`. An empty array matches no row. `parent('col')`, an array column of a `lateral`'s parent row,
 * gives `"col" = ANY("parent"."col")`. Anything else throws as the query compiles, and so does an item that is an array,
 * `db.param()`, a `sql` fragment, `db.parent()`, `db.Default`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()`.
 * @param a An array of values, or `parent()`
 */
export const eqAny: {
  (a: ParentColumn): SQLFragment<boolean | null, never>;
  <T>(a: readonly T[]): SQLFragment<boolean | null, T>;
} = (a: readonly unknown[] | ParentColumn) =>
  sql<SQL, boolean | null>`${self} = ANY(${a instanceof ParentColumn ? a : anyArray(a)})`;

/* === jsonb === */

// what JSON.stringify would not write as it is, for the messages of jsonbContains() and jsonbPathExists(); undefined
// for a JSON value
const notJSON = (x: unknown) =>
  x === undefined ? '`undefined`' : typeof x === 'function' ? 'a function' : typeof x === 'bigint' ? 'a `bigint`' :
    notAValue(x) ?? (typeof x === 'symbol' ? 'a symbol' : undefined);

// the value goes as JSON text: pg alone sends a string as text and an array as '{1,2}', which the cast to jsonb refuses
// (22P02); JSON.stringify would leave out a key holding undefined, a function or a symbol, so that { a: undefined }
// matched every row, write them as null in an array, and a wrapper as its fields, which match no row, with no error;
// `keyOut` and `keyAdvice` say what a key left out of an object would do, and what to do instead; `object`, that the
// argument as a whole is an object, which Postgres requires of jsonb_path_exists()'s vars (22023)
const jsonbParam = (a: unknown, fn: string, arg: string, keyOut: string, keyAdvice: string, object = false) => {
  const
    name = notAValue(a),
    takes = object ? 'an object of JSON values' : 'a JSON value';
  // each a whole literal, so that the docs can quote it (website/check-prose.mjs)
  if (name !== undefined) {
    return refused(object ?
      `\`${fn}()\` sends its ${arg} as JSON text, so it takes an object of JSON values, not ${name}: give an object; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.` :
      `\`${fn}()\` sends its ${arg} as JSON text, so it takes a JSON value, not ${name}: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.`);
  }
  let refusal: string | undefined, top = true;
  try {
    const text = JSON.stringify(a, function (this: unknown, key, x: unknown) {
      const what = refusal === undefined ? notJSON(x) : undefined;
      if (what !== undefined) {
        const
          inArray = Array.isArray(this),
          at = top ? '' : inArray ? ` at item ${key}` : ` at key \`${key}\``,
          effect = typeof x === 'bigint' ? 'throw' : typeof x === 'object' ? 'write its fields' :
            top ? 'write nothing' : inArray ? 'write `null` in its place' : keyOut,
          advice = top && object ? `Give ${takes}` : typeof x === 'bigint' ? 'Give it as a number or a string' :
            top || inArray ? 'Give a JSON value' : keyAdvice;
        refusal = `\`${fn}()\` sends its ${arg} as JSON text, so it takes ${takes}, not ${what}${at}: \`JSON.stringify\` would ${effect}. ${advice}.`;
      }
      top = false;
      return refusal === undefined ? x : null;
    });
    return refusal === undefined ? param(text, 'jsonb') : refused(refusal);
  } catch (err) {
    return refused(`\`${fn}()\` sends its ${arg} as JSON text, so it takes ${takes}: \`JSON.stringify\` threw "${(err as Error).message}". Give ${takes}.`);
  }
};

// a jsonb domain whose zapatos/custom placeholder is narrowed fits no JSONValue: its type, given as T, is the condition's,
// and is never inferred from the value, which would let a string through on a text column; a value it contains need
// not hold every key the placeholder requires, so the value stays a JSONValue; written in place, as eqAny()'s
/**
 * `"col" @> CAST($1 AS "jsonb")`, on a `jsonb` column: its JSON contains the value's. The value is sent as JSON text,
 * `JSON.stringify(a)`, whatever `castObjectParamsToJson` and `castArrayParamsToJson`, so a string is a JSON string and
 * `null` the JSON `null`. A `json` column passes the type, and Postgres refuses it (42883). As the query compiles, what
 * JSON lacks throws, at any depth (`undefined`, a function, a symbol, a `bigint`, a circular value), and so do
 * `db.param()`, `db.parent()`, a `sql` fragment, `db.Default`, `db.self`, `db.raw()`, `db.cols()` and `db.vals()`.
 * On a `jsonb` domain whose `zapatos/custom` placeholder is narrowed, name its type: `jsonbContains<PgProjection>(a)`.
 * @param a A JSON value
 */
export const jsonbContains: {
  (a: JSONValue): SQLFragment<boolean | null, JSONValue>;
  <T>(a: JSONValue): SQLFragment<boolean | null, T>;
} = (a: JSONValue) => sql<SQL, boolean | null>`${self} @> ${jsonbParam(a, 'jsonbContains', 'value', 'leave the key out, and the value match more rows', 'Give a JSON value, or leave the key out')}`;

// the path goes as text, cast to jsonpath, so that Postgres parses it: pg would send anything else as JSON or as its
// String(), which Postgres could read as another path
const jsonpathParam = (path: unknown) => typeof path === 'string' ? param(path, 'jsonpath') :
  refused(`\`jsonbPathExists()\` takes its path as a string, not ${notJSON(path) ??
    (path === null ? '`null`' : Array.isArray(path) ? 'an array' : typeof path === 'object' ? 'an object' : `a \`${typeof path}\``)}: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.`);

// as jsonbContains()'s signatures, T given for a narrowed jsonb domain, never inferred, and written in place
/**
 * `jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`, on a `jsonb` column: the SQL/JSON path
 * finds an item in the column's JSON. The path is one parameter, and its variables another: each `$name` of the path is
 * a key of `vars`, sent as JSON text, `JSON.stringify(vars)`, and `{}` when left out, so a value never goes into the
 * path. Postgres raises the path's errors: 42601 for an invalid path, 2203A for a `strict` path on a row that lacks its
 * key, 42704 for a variable `vars` lacks. As the query compiles, a path that is no string throws, and so does what JSON
 * lacks in `vars`, at any depth, as in `jsonbContains()`. No GIN index serves the function, where one serves `@>`; an
 * expression index on the call, its path and `vars` fixed, serves that call.
 * On a `jsonb` domain whose `zapatos/custom` placeholder is narrowed, name its type: `jsonbPathExists<PgProjection>(…)`.
 * @param path A SQL/JSON path: `'$.prizes[*] ? (@ == $prize)'`
 * @param vars The path's variables, an object: `{ prize: 'Golden Gull' }`
 */
export const jsonbPathExists: {
  (path: string, vars?: JSONObject): SQLFragment<boolean | null, JSONValue>;
  <T>(path: string, vars?: JSONObject): SQLFragment<boolean | null, T>;
} = (path: string, vars: JSONObject = {}) =>
  sql<SQL, boolean | null>`jsonb_path_exists(${self}, ${jsonpathParam(path)}, ${jsonbParam(vars, 'jsonbPathExists', 'variables', 'leave the key out', 'Give a JSON value', true)})`;

/**
 * Join conditions with `OR`: `or(a, b)` compiles to `(a OR b)`, and `or()` to `FALSE`, so that
 * it matches no row. Zapatos 6.6.1 wrote `()`, which Postgres refuses. Its operands need no
 * parentheses of their own: `AND` binds tighter than `OR`.
 * @param conditions `SQLFragment`s (other conditions, or `sql` using `self`) or `Whereable`s
 */
export const or = <T>(...conditions: (SQLFragment<any, T> | Whereable)[]) =>
  conditions.length > 0 ? sql<SQL, boolean | null, T>`(${mapWithSeparator(conditions, sql` OR `, c => c)})` : sql<SQL, boolean | null, T>`FALSE`;
/**
 * Join conditions with `AND`, each in its own parentheses: `` and(sql`a OR b`, c) `` compiles to
 * `((a OR b) AND (c))`, and `and()` to `TRUE`, so that it matches every row, as a `Whereable` `{}`
 * does. Zapatos 6.6.1 wrote `(a OR b AND c)`, which reads `a OR (b AND c)`, and `()` for `and()`.
 * @param conditions `SQLFragment`s (other conditions, or `sql` using `self`) or `Whereable`s
 */
export const and = <T>(...conditions: (SQLFragment<any, T> | Whereable)[]) =>
  conditions.length > 0 ? sql<SQL, boolean | null, T>`(${mapWithSeparator(conditions, sql` AND `, c => sql`(${c})`)})` : sql<SQL, boolean | null, T>`TRUE`;
/**
 * Negate a condition, all of it: `` not(sql`a OR b`) `` compiles to `(NOT (a OR b))`, and
 * `not({ id: 1 })` to `(NOT (("id" = $1)))`. Zapatos 6.6.1 wrote `(NOT a OR b)`, which reads
 * `(NOT a) OR b`.
 * @param condition A `SQLFragment` (another condition, or `sql` using `self`) or a `Whereable`
 */
export const not = <T>(condition: SQLFragment<any, T> | Whereable) => sql<SQL, boolean | null, T>`(NOT (${condition}))`;

/** `"col" @> $1`, typed on the element, as in Zapatos 6.6.1. On an `int4[]` column: `arrayContains<number[]>([[1]])`, or `` sql`${self} @> ${param([1], 'int4[]')}` ``. */
export const arrayContains = <T>(a: T[] | ParentColumn) => sql<SQL, boolean | null, T>`${self} @> ${conditionalParam(a)}`;
/** `"col" <@ $1`, typed on the element, as in Zapatos 6.6.1. On an `int4[]` column: `arrayContainedIn<number[]>([[1, 2]])`, or `` sql`${self} <@ ${param([1, 2], 'int4[]')}` ``. */
export const arrayContainedIn = <T>(a: T[] | ParentColumn) => sql<SQL, boolean | null, T>`${self} <@ ${conditionalParam(a)}`;
/** `"col" && $1`, typed on the element, as in Zapatos 6.6.1. On an `int4[]` column: `arrayOverlaps<number[]>([[1, 2]])`, or `` sql`${self} && ${param([1, 2], 'int4[]')}` ``. */
export const arrayOverlaps = <T>(a: T[] | ParentColumn) => sql<SQL, boolean | null, T>`${self} && ${conditionalParam(a)}`;

/* === subqueries === */

// the last identifier of a name, as Postgres reads the text compileExpression writes, which ends with a quoted
// part: `""` undoubled, a `U&` part's escapes decoded (no `UESCAPE` follows one there), then cut to its first 63
// bytes in UTF-8, at a character's end, as Postgres truncates a name (NAMEDATALEN)
const lastIdentifier = (name: string) => {
  const
    parts = sql`${name}`.compile().text.match(/(?:[Uu]&)?"(?:[^"]|"")*"|[^".\s]+/g) ?? [],
    last = parts[parts.length - 1] ?? '',
    unicode = /^[Uu]&/.test(last),
    unquoted = last.slice(unicode ? 3 : 1, -1).replace(/""/g, '"'),
    decoded = !unicode ? unquoted : unquoted.replace(/\\(?:\\|([0-9A-Fa-f]{4})|\+([0-9A-Fa-f]{6}))/g, (escape, four, six) =>
      escape === '\\\\' ? '\\' : parseInt(four ?? six, 16) > 0x10ffff ? escape : String.fromCodePoint(parseInt(four ?? six, 16)));
  let bytes = 0, end = 0;
  for (const c of decoded) {
    if ((bytes += Buffer.byteLength(c)) > 63) break;
    end += c.length;
  }
  return decoded.slice(0, end);
};

// `FROM <table>[ AS <alias>][ WHERE <where>]`, compiled with neither the column (`self` throws) nor the mark it would
// inherit (`parent()` throws without `parent`), so that its SQL does not depend on where it sits; compile is
// overridden as select() does, so a copy() of the condition, which shares its expressions, keeps it. When `parent`
// names the subquery's own table, Postgres reads `parent()` as a column of the subquery's row, the wrong rows with
// no error: refused as the query compiles
const subquery = (fn: string, head: SQL, table: string, where: SQL | AllType, options?: { parent?: string; alias?: string }) => {
  const
    parent = callerValue(options, 'parent'), alias = callerValue(options, 'alias'),  // `null` options are none, as in select()
    own = alias ?? table;
  if (typeof parent === 'string' && typeof own === 'string' && lastIdentifier(parent) === lastIdentifier(own)) {
    return refused(`\`${fn}()\` was given \`parent: '${parent}'\`, which names "${lastIdentifier(own)}", the subquery's own name, so Postgres would read \`parent()\` as a column of the subquery's row: give the subquery another name with the \`alias\` option.`);
  }
  const
    query = sql`${head} FROM ${table}${alias === undefined ? [] : sql` AS ${alias}`}${where === all ? [] : sql` WHERE ${where}`}`,
    nestedCompile = query.compile;
  query.compile = result => nestedCompile(result, undefined, undefined);
  if (parent !== undefined) query.parentTable = parent;
  return query;
};

/**
 * `EXISTS (SELECT 1 FROM <table> WHERE <where>)`: some row of `table` matches `where`. In `where`, `parent('id')`
 * is the outer row's column, `"<parent>"."id"`, once `parent` names the outer table. Never `NULL`; it fits under any
 * key, in `and()`, `or()` and `not()`, or as the whole `where`. The anti-join is `not(exists(…))`.
 * @param table The subquery's table
 * @param where A Whereable or `sql` fragment on `table`, or `all` for no `WHERE`
 * @param options `parent`, the outer table as the outer query names it (its alias, if any); `alias`, `AS <alias>`
 * after `table`, needed when `parent` names it; `null` is none
 */
export const exists = <T extends Table>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, options?: { parent?: string; alias?: string }) =>
  sql<SQL, boolean, never>`EXISTS (${subquery('exists', raw('SELECT 1'), table, where, options)})`;

/**
 * `"col" IN (SELECT <column> FROM <table> WHERE <where>)`, as a Whereable value, typed on `column`'s type, `null`
 * aside. Under `not()`, a `NULL` from the subquery makes it match no row, as Postgres reads `NOT IN`: for the
 * anti-join, write `not(exists(…))`.
 * @param table The subquery's table
 * @param where A Whereable or `sql` fragment on `table`, or `all` for no `WHERE`
 * @param column The column of `table` the subquery selects
 * @param options `parent` and `alias`, as in `exists()`; `null` is none
 */
export const isInSelect = <T extends Table, C extends keyof SelectableForTable<T>>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, column: C, options?: { parent?: string; alias?: string }) =>
  sql<SQL, boolean | null, Exclude<SelectableForTable<T>[C], null>>`${self} IN (${subquery('isInSelect', sql`SELECT ${column as Column}`, table, where, options)})`;

/* === full-text search === */

declare const tsvector: unique symbol;
/**
 * What `websearchToTsquery()` compares with: a type no column takes but one typed `any`, as a `tsvector` column
 * is through its `PgTsvector` placeholder, left as generated. It exists only in the type.
 */
export interface TsvectorColumn { readonly [tsvector]: true }

// a value as a parameter: pg would send a Parameter or a fragment as JSON, Default and self as their names
const searchParam = (which: string, x: unknown, cast?: string) => {
  const name = notAValue(x);
  return name === undefined ? param(x, cast) :
    refused(`\`websearchToTsquery()\` sends its configuration and its query as parameters: give the ${which} as a string, not ${name}; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.`);
};

/**
 * `"col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)`, on a `tsvector` column: the query is read as a
 * search box reads it, words, `"quoted phrases"`, `or` and `-word`, and never raises a syntax error, so it takes a
 * user's input as it is (https://www.postgresql.org/docs/current/textsearch-controls.html). Name the configuration
 * that built the column's vector: its stems are the ones that match. The type takes a column typed `any`, as the
 * `PgTsvector` placeholder is generated; once you edit it, name it: `websearchToTsquery<PgTsvector>(…)`.
 * @param config A text search configuration, such as `'english'`, sent as a parameter
 * @param query The search, sent as a parameter
 */
// `NoInfer<T>` of ./utils, written out: a library's declarations could not name it, zapatos/db not exporting it (TS2742)
export const websearchToTsquery = <T = TsvectorColumn>(config: string, query: string) =>
  sql<SQL, boolean | null, [T][T extends any ? 0 : never]>`${self} @@ websearch_to_tsquery(${searchParam('configuration', config, 'regconfig')}, ${searchParam('query', query)})`;

// things that aren't genuinely conditions
type PluralisingIntervalUnit = 'microsecond' | 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'decade';
type IntervalUnit = PluralisingIntervalUnit | `${PluralisingIntervalUnit}s` | 'century' | 'centuries' | 'millennium' | 'millennia';
/** `now() + $1`, `$1` being `` `${n} ${unit}` ``, an interval: a value, as `now`. */
export const fromNow = (n: number, unit: IntervalUnit = 'millisecond') => sql`now() + ${param(String(n) + ' ' + unit)}`;
export const after = gt;
export const before = lt;
/**
 * `now()`: a value, not a test, to compare with (`after(now)`) or to set a column to. Alone as a `where` value,
 * Postgres refuses it (42804), which the type lets through: in a `SELECT` list, the same Whereable runs.
 */
export const now = sql`now()`;

// these are really more operations than conditions, but we sneak them in here for now, for use e.g. in UPDATE queries
/**
 * `"col" + $1`, of a number. A `Date` type-checks on a `date`, `timestamp` or `timestamptz` column, and Postgres refuses
 * it: 42725 on a `date`; on the other two, 42804 in a `where`, 22007 elsewhere. To add days to a date:
 * `` sql`${self} + ${param(3, 'int4')}` ``; a day to a timestamp: `` sql`${self} + ${param('1 day', 'interval')}` ``.
 */
export const add = <T extends number | Date>(a: T) => sql<SQL, number, T>`${self} + ${conditionalParam(a)}`;
/**
 * `"col" - $1`, of a number. Of a `Date`, it gives days on a `date`, an interval on a `timestamp` or `timestamptz`:
 * Postgres refuses it as an `update()` value (42804), and runs it nested in a `sql` fragment or in a `SELECT` list.
 * To subtract days from a date: `` sql`${self} - ${param(3, 'int4')}` ``.
 */
export const subtract = <T extends number | Date>(a: T) => sql<SQL, number, T>`${self} - ${conditionalParam(a)}`;
