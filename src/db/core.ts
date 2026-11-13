/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import type * as pg from 'pg';

import { getConfig, SQLQuery } from './config';
import { identifier, isPOJO, NoInfer, space } from './utils';

import type {
  Updatable,
  Whereable,
  Table,
  Column,
} from 'zapatos/schema';

const timing = typeof performance === 'object' ?
  () => performance.now() :
  () => Date.now();

// === symbols, types, wrapper classes and shortcuts ===

/**
 * Compiles to `DEFAULT` for use in `INSERT`/`UPDATE` queries. As a `Whereable`
 * value, in `isIn`, or as the value of `eq()`, `add()` and the other conditions,
 * it throws: a filter has no default. For `add()` and `subtract()`, which are
 * UPDATE values, give `Default` as the value itself: `{ n: Default }`.
 * `vals([Default])` throws too in a fragment value of `vals({…})`, compiled with
 * its key as the current column, as a `Whereable` value is. Zapatos 6.6.1 sent it
 * as the string `'Symbol(DEFAULT)'`.
 */
export const Default = Symbol('DEFAULT');
export type DefaultType = typeof Default;

/**
 * Compiles to the current column name within a `Whereable`, in a fragment value:
 * `` { n: sql`${self} > 0` } `` gives `("n" > 0)`. As a `Whereable` value, in
 * `isIn`, or as the value of `eq()` and the other conditions, it throws: it is
 * the column, not a value to compare it with. Zapatos 6.6.1 sent it as the
 * string `'Symbol(self)'`.
 */
export const self = Symbol('self');
export type SelfType = typeof self;

/**
 * Signals all rows are to be returned (without filtering via a `WHERE` clause)
 */
export const all = Symbol('all');
export type AllType = typeof all;

/**
 * JSON types
 */
export type JSONValue = null | boolean | number | string | JSONObject | JSONArray;
export type JSONObject = { [k: string]: JSONValue };
export type JSONArray = JSONValue[];

/**
 * `int8` or `numeric` value represented as a string
 */
export type Int8String = `${number}`;
export type NumericString = `${number}`;

/**
 * Generic range value represented as a string
 */
export type RangeString<Bound extends string | number> = `${'[' | '('}${Bound},${Bound}${']' | ')'}`;

/**
 * `tsrange`, `tstzrange` or `daterange` value represented as a string. The
 * format of the upper and lower bound `date`, `timestamp` or `timestamptz`
 * values depends on pg's `DateStyle` setting.
 */
export type DateRangeString = RangeString<string>;

/**
 * `int4range`, `int8range` or `numrange` value represented as a string
 */
export type NumberRangeString = RangeString<number | ''>;

/**
 * `bytea` value represented as a hex string. Note: for large objects, use
 * something like https://www.npmjs.com/package/pg-large-object instead.
 */
export type ByteArrayString = `\\x${string}`;

/**
 * Make a function `STRICT` in the Postgres sense — where it's an alias for
 * `RETURNS NULL ON NULL INPUT` — with appropriate typing.
 *
 * Only `null` is passed through, as only `NULL` is in Postgres: `undefined` is
 * passed to `fn`, and with `strictNullChecks` the type refuses it unless `fn`
 * takes it.
 *
 * For example, Zapatos' `toBuffer()` function is defined as:
 *
 * ```
 * export const toBuffer = strict((ba: ByteArrayString) => Buffer.from(ba.slice(2), 'hex'));
 * ```
 *
 * The generic input and output types `FnIn` and `FnOut` can be inferred from
 * `fn`, as seen above, but can also be explicitly narrowed. For example, to
 * convert specifically from `TimestampTzString` to Luxon's `DateTime`, but
 * pass through `null`s unchanged:
 *
 * ```
 * const toDateTime = db.strict<db.TimestampTzString, DateTime>(DateTime.fromISO);
 * ```
 *
 * @param fn The single-argument transformation function to be made strict.
 */
export function strict<FnIn, FnOut>(fn: (x: FnIn) => FnOut):
  <T extends FnIn | null>(d: T) => T extends FnIn ? Exclude<T, FnIn> | FnOut : T {
  return function <T extends FnIn | null>(d: T) {
    return (d === null ? null : fn(d as FnIn)) as any;
  };
}

/**
 * Convert a `bytea` hex representation to a JavaScript `Buffer`. Note: for
 * large objects, use something like
 * [pg-large-object](https://www.npmjs.com/package/pg-large-object) instead.
 *
 * @param ba The `ByteArrayString` hex representation (or `null`)
 */
export const toBuffer = strict((ba: ByteArrayString) => Buffer.from(ba.slice(2), 'hex'));

// a type-only tag (no JS is emitted): it keeps raw(), cols() and vals() from passing as a `Parameter<T>`, which
// is structural ({ value: T }), so the generated Whereable, Insertable and Updatable types refuse them as values;
// and cols() and vals() from passing as a `ParentColumn` ({ value?: Column }), which a Whereable value also takes
declare const wrapper: unique symbol;

/**
 * Compiles to a numbered query parameter (`$1`, `$2`, etc) and adds the wrapped value
 * at the appropriate position of the values array passed to `pg`.
 * @param x The value to be wrapped
 * @param cast Optional cast type. If a string, the parameter will be cast to
 * this type within the query e.g. `CAST($1 AS "type")` instead of plain `$1`.
 * Without a `"`, the type is split on `.` and each part quoted: `public.mood`
 * gives `"public"."mood"`. Array bounds at the end, `[]` or `[n]`, follow the
 * quotes: `int4[]` gives `"int4"[]`. With a `"`, the type is written as is if
 * `"type"` is well-formed: non-empty quoted parts without NUL, in which `""`
 * stands for one `"`, joined by `.` with optional whitespace around it
 * (`pg_catalog"."int4`), or if it is already quoted that way (`"a.b"`).
 * Otherwise it is one quoted identifier, any `"` doubled (as `quote_ident`
 * does), so it cannot close its quotes. No part is left unquoted, so a name
 * the SQL grammar spells (`int`, `double precision`, `varchar(10)`) is no type
 * here: use the type's own name (`int4`, `float8`, `varchar`), or `sql`
 * (`` sql`CAST(${param(x)} AS varchar(10))` ``). If
 * `true`, the value will be JSON stringified and cast to `json` (irrespective
 * of the configuration parameters `castArrayParamsToJson` and
 * `castObjectParamsToJson`). If `false`, the value will **not** be JSON-
 * stringified or cast to `json` (again irrespective of the configuration
 * parameters `castArrayParamsToJson` and `castObjectParamsToJson`).
 */
export class Parameter<T = any> { declare readonly [wrapper]?: never; constructor(public value: T, public cast?: boolean | string) { } }

/**
 * Returns a `Parameter` instance, which compiles to a numbered query parameter
 * (`$1`, `$2`, etc) and adds its wrapped value at the appropriate position of
 * the values array passed to `pg`. As a `Whereable` value, or in `vals([…])`
 * (so `isIn`), it compiles the same way: `"col" = CAST($1 AS "text")`. Zapatos
 * 6.6.1 wrapped it in another parameter there, sent as JSON (`'{"value":1}'`).
 * @param x The value to be wrapped
 * @param cast Optional cast type. If a string, the parameter will be cast to
 * this type within the query e.g. `CAST($1 AS "type")` instead of plain `$1`.
 * Without a `"`, the type is split on `.` and each part quoted: `public.mood`
 * gives `"public"."mood"`. Array bounds at the end, `[]` or `[n]`, follow the
 * quotes: `int4[]` gives `"int4"[]`. With a `"`, the type is written as is if
 * `"type"` is well-formed: non-empty quoted parts without NUL, in which `""`
 * stands for one `"`, joined by `.` with optional whitespace around it
 * (`pg_catalog"."int4`), or if it is already quoted that way (`"a.b"`).
 * Otherwise it is one quoted identifier, any `"` doubled (as `quote_ident`
 * does), so it cannot close its quotes. No part is left unquoted, so a name
 * the SQL grammar spells (`int`, `double precision`, `varchar(10)`) is no type
 * here: use the type's own name (`int4`, `float8`, `varchar`), or `sql`
 * (`` sql`CAST(${param(x)} AS varchar(10))` ``). If
 * `true`, the value will be JSON stringified and cast to `json` (irrespective
 * of the configuration parameters `castArrayParamsToJson` and
 * `castObjectParamsToJson`). If `false`, the value will **not** be JSON
 * stringified or cast to `json` (again irrespective of the configuration
 * parameters `castArrayParamsToJson` and `castObjectParamsToJson`).
 */
export function param<T = any>(x: T, cast?: boolean | string) { return new Parameter(x, cast); }

/**
 * 💥💥💣 **DANGEROUS** 💣💥💥
 *
 * Compiles to the wrapped string value, as is, which may enable SQL injection
 * attacks.
 */
export class DangerousRawString { declare readonly [wrapper]: 'raw'; constructor(public value: string) { } }

/**
 * 💥💥💣 **DANGEROUS** 💣💥💥
 *
 * Remember [Little Bobby Tables](https://xkcd.com/327/).
 * Did you want `db.param` instead?
 * ---
 * Returns a `DangerousRawString` instance, wrapping a string.
 * `DangerousRawString` compiles to the wrapped string value, as-is, which may
 * enable SQL injection attacks.
 *
 * As a `Whereable` value, in `isIn()`, as the value of `eq()` and the other
 * conditions, and in `vals({…})`, so as an `insert()`, `upsert()` or
 * `update()` value, it throws: write a `sql` fragment value instead,
 * `` { name: sql`${self} = ${raw("'Ada'")}` } ``. The type refuses it there,
 * except on a column typed `any` and in `vals({…})` of a `sql` template.
 * Zapatos 6.6.1 sent it there as JSON (`'{"value":"…"}'`), not as SQL. In
 * `upsert()`'s `updateValues` it is SQL, on a column that takes a string
 * (text, `jsonb`).
 */
export function raw(x: string) { return new DangerousRawString(x); }

/**
 * Wraps either an array or object, and compiles to a quoted, comma-separated
 * list of array values (for use in a `SELECT` query) or object keys (for use
 * in an `INSERT`, `UPDATE` or `UPSERT` query, alongside `ColumnValues`).
 */
export class ColumnNames<T> { declare readonly [wrapper]: 'cols'; constructor(public value: T) { } }
/**
 * Returns a `ColumnNames` instance, wrapping either an array or an object.
 * `ColumnNames` compiles to a quoted, comma-separated list of array values (for
 * use in a `SELECT` query) or object keys (for use in an `INSERT`, `UDPATE` or
 * `UPSERT` query alongside a `ColumnValues`). As a filter value and in
 * `vals({…})`, so as a write value, it throws, and the type refuses it, as for
 * `raw()`; Zapatos 6.6.1 sent it as JSON.
 */
export function cols<T>(x: T) { return new ColumnNames<T>(x); }

/**
 * Compiles to a quoted, comma-separated list of object keys for use in an
 * `INSERT`, `UPDATE` or `UPSERT` query, alongside `ColumnNames`.
 */
export class ColumnValues<T> { declare readonly [wrapper]: 'vals'; constructor(public value: T) { } }
/**
 * Returns a ColumnValues instance, wrapping an object. ColumnValues compiles to
 * a quoted, comma-separated list of object keys for use in an INSERT, UPDATE
 * or UPSERT query alongside a `ColumnNames`. In an array as in an object, a
 * `Parameter` compiles as it is (`$1`, `CAST($1 AS "text")`) and `Default` to
 * `DEFAULT`; Zapatos 6.6.1 wrapped both in another parameter in an array. An array
 * throws on `Default` in a filter (`isIn`), and in a fragment value of `vals({…})`
 * (`` { role: sql`${vals([Default])}` } ``), compiled as a `Whereable` value is.
 * In an array, `parent()` compiles to the parent column (`"authors"."id"`), as
 * in a `sql` template; Zapatos 6.6.1 sent it as JSON (`'{"value":"id"}'`).
 * In an object, it is the parent column too in a nested query, and throws
 * outside one, so as an `insert()`, `upsert()` or `update()` value.
 * `raw()`, `cols()` and `vals()` throw in an object, and in an array in a
 * filter, as `Default` does; in an array outside one they are still sent as
 * JSON. As a filter value `vals(x)` throws, and the type refuses it as a
 * value, as for `raw()`.
 */
export function vals<T>(x: T) { return new ColumnValues<T>(x); }

/**
 * Compiles to the name of the column it wraps in the table of the parent query.
 * @param value The column name
 */
export class ParentColumn<T extends Column | undefined = Column | undefined> { declare readonly [wrapper]?: 'parent'; constructor(public value?: T) { } }
/**
 * Returns a `ParentColumn` instance, wrapping a column name, which compiles to
 * that column name of the table of the parent query. Without a column, it takes
 * the column of the filter; with no filter, it throws, as `` sql`${parent()}` ``
 * does (R58). As a `Whereable` value, in `eq()` and in `isIn()` /
 * `isNotIn()`, in a `lateral` subquery of `authors`:
 * `{ authorId: isIn([parent('id'), 2]) }` gives `("authorId" IN ("authors"."id", $1))`.
 * In `vals({…})` it is the parent column too, with no column the column of its
 * key. Outside a nested query it throws, so as an `insert()`, `upsert()` or
 * `update()` value. Zapatos 6.6.1 sent it in `isIn()` and in `vals({…})` as
 * JSON (`'{"value":"id"}'`).
 */
export function parent<T extends Column | undefined = Column | undefined>(x?: T) { return new ParentColumn<T>(x); }


// ColumnNames and ColumnValues of any value: a `Parameter` accepted them in a `sql` template before the tag above
export type GenericSQLExpression = SQLFragment<any, any> | Parameter | DefaultType | DangerousRawString | SelfType | ColumnNames<any> | ColumnValues<any>;
export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable | any[]> | Whereable | Column | ParentColumn | GenericSQLExpression;
export type SQL = SQLExpression | SQLExpression[];

export type Queryable = pg.ClientBase | pg.Pool;


// === SQL tagged template strings ===

/**
 * Tagged template function returning a `SQLFragment`. The first generic type
 * argument defines what interpolated value types are allowed. The second
 * defines what type the `SQLFragment` produces, where relevant (i.e. when
 * calling `.run(...)` on it, or using it as the value of an `extras` object).
 *
 * An interpolated string is a table or column name: it is double-quoted and
 * split on `.` (`'s.t'` gives `"s"."t"`), and any `"` in it is doubled, as
 * `quote_ident` does (`'a"b'` gives `"a""b"`), so it cannot close its quotes.
 * A string that is already a well-formed quoted name is written as is: a
 * quoted identifier, then quoted, `U&` quoted or unquoted ones, joined by `.`
 * (`'"s"."t"'`, `'"a""b"'`, `'"s".t.U&"c"'`); one that already compiled to
 * quoted names only is written as before (`'a""b'` gives `"a""b"`). Unlike
 * Zapatos 6.6.1, any other string that starts and ends with `"` is quoted like
 * any other name: `'"a" || "b"'` gives `"""a"" || ""b"""`, one identifier.
 */
export function sql<
  Interpolations = SQL,
  RunResult = pg.QueryResult['rows'],
  Constraint = never,
>(literals: TemplateStringsArray, ...expressions: NoInfer<Interpolations>[]) {
  return new SQLFragment<RunResult, Constraint>(Array.prototype.slice.apply(literals), expressions as SQL[]);
}

let preparedNameSeq = 0;

// one or more double-quoted identifiers joined by `.`, as Postgres lexes them: `"a"`, `"a"."b"`, `"a""b"`;
// whitespace may surround a dot, as in the aggregate rule of shortcuts.ts, but a comment may not
// (`\v` is whitespace from Postgres 17; before, it is a syntax error)
const quotedIdentifiers = /^"(?:[^"\0]|"")+"(?:[ \t\n\r\f\v]*\.[ \t\n\r\f\v]*"(?:[^"\0]|"")+")*$/;

// a table or column name already quoted, as Postgres lexes it: a quoted identifier, then quoted, `U&` quoted
// or unquoted ones after a `.` (`"s".t."c"`, `"t".U&"c"`), ending with `"`, so no `UESCAPE '…'` can follow
const quotedName = new RegExp(`^"(?:[^"\\0]|"")+"(?:${space}\\.${space}(?:${identifier}))*(?<=")$`, 'u');

const
  defaultInWhereable = '`db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values.',
  selfInWhereable = '`db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column.',
  wrapperInWhereable = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`.',
  wrapperAsValue = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value: to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`.',
  builtinWhereable = (name: string) => `A built-in \`${name}\` has no meaning as a Whereable (a filter): it would compile to its own enumerable keys, and to \`TRUE\`, every row, when it has none. To compare with a value, give it as \`db.param(…)\`; to filter, give a plain object (\`{ column: value }\`); await a \`Promise\` first.`;

// built-in objects that are no filter, by their exact prototype, so that a class instance never is one, even of
// a class that extends a built-in. Zapatos 6.6.1 compiled them as Whereables of their own keys: none (`TRUE`,
// every row), or indexes (`"0" = $1`). A typed array's prototype is one whose own prototype is %TypedArray%'s:
// `Uint8Array.prototype`, `Float64Array.prototype`…, and not a subclass's (`Buffer` is listed for this reason)
const
  builtinPrototypes = new Set<unknown>([
    Date, Map, Set, WeakMap, WeakSet, RegExp, Promise, ArrayBuffer, DataView, Buffer, Number, String, Boolean,
    Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError,
  ].map(builtin => builtin.prototype)),
  typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);

const isBuiltin = (x: object) => {
  const prototype = Object.getPrototypeOf(x);
  return builtinPrototypes.has(prototype) || (prototype !== null && Object.getPrototypeOf(prototype) === typedArrayPrototype);
};

// raw(), cols() and vals() as a filter value, or in vals({…}) (so as a write value): Zapatos 6.6.1 sent them as JSON;
// compiling raw() there as SQL would turn a caller's raw(input), a parameter until now, into an injection, so they throw
const isWrapper = (x: unknown) => x instanceof DangerousRawString || x instanceof ColumnNames || x instanceof ColumnValues;

export class SQLFragment<RunResult = pg.QueryResult['rows'], Constraint = never> {
  protected constraint?: Constraint;

  /**
   * When calling `run`, this function is applied to the object returned by `pg`
   * to produce the result that is returned. By default, the `rows` array is
   * returned — i.e. `(qr) => qr.rows` — but some shortcut functions alter this
   * in order to match their declared `RunResult` type.
   */
  runResultTransform: (qr: pg.QueryResult) => any = qr => qr.rows;

  parentTable?: string = undefined;  // used for nested shortcut select queries
  preparedName?: string = undefined;  // for prepared statements

  noop = false;  // if true, bypass actually running the query unless forced to e.g. for empty INSERTs
  noopResult: any;  // if noop is true and DB is bypassed, what should be returned?

  constructor(protected literals: string[], protected expressions: SQL[]) { }

  /**
   * Performs a shallow copy of this SQLFragment, optionally overriding some of its properties.
   * @param override The properties to override
   */
  copy(override?: {
    literals?: string[];
    expressions?: SQL[];
    parentTable?: string;
    preparedName?: string;
    noop?: boolean;
    noopResult?: any;
  }): SQLFragment<RunResult, Constraint> {
    const { literals = this.literals, expressions = this.expressions, ...overrideRest } = override ?? {};
    const copy = new SQLFragment<RunResult, Constraint>(literals, expressions);
    return Object.assign(copy, {
      parentTable: this.parentTable,
      preparedName: this.preparedName,
      noop: this.noop,
      noopResult: this.noopResult
    }, overrideRest);
  }

  /**
   * Instruct Postgres to treat this as a prepared statement: see
   * https://node-postgres.com/features/queries#prepared-statements
   * @param name A name for the prepared query. If not specified, it takes the
   * value '_zapatos_prepared_N', where N is an increasing sequence number.
   */
  prepared = (name = `_zapatos_prepared_${preparedNameSeq++}`) => {
    this.preparedName = name;
    return this;
  };

  /**
   * Compile and run this query using the provided database connection. What's
   * returned is piped via `runResultTransform` before being returned.
   * @param queryable A database client or pool
   * @param force If true, force this query to hit the DB even if it's marked as a no-op
   */
  run = async (queryable: Queryable, force = false): Promise<RunResult> => {
    const
      query = this.compile(),
      { queryListener, resultListener } = getConfig(),
      txnId = (queryable as any)._zapatos?.txnId;

    if (queryListener) queryListener(query, txnId);

    let startMs: number | undefined, result;
    if (resultListener) startMs = timing();

    if (!this.noop || force) {
      const qr = await queryable.query(query);
      result = this.runResultTransform(qr);

    } else {
      result = this.noopResult;
    }

    if (resultListener) resultListener(result, txnId, timing() - startMs!, query);
    return result;
  };

  /**
   * Compile this query, returning a `{ text: string, values: any[] }` object
   * that could be passed to the `pg` query function. Arguments are generally
   * only passed when the function calls itself recursively.
   */
  compile = (result: SQLQuery = { text: '', values: [] }, parentTable?: string, currentColumn?: Column) => {
    if (this.parentTable) parentTable = this.parentTable;

    if (this.noop) result.text += "/* marked no-op: won't hit DB unless forced -> */ ";
    result.text += this.literals[0];
    for (let i = 1, len = this.literals.length; i < len; i++) {
      this.compileExpression(this.expressions[i - 1], result, parentTable, currentColumn);
      result.text += this.literals[i];
    }

    if (this.preparedName != null) result.name = this.preparedName;

    return result;
  };

  compileExpression = (expression: SQL, result: SQLQuery = { text: '', values: [] }, parentTable?: string, currentColumn?: Column) => {
    if (this.parentTable) parentTable = this.parentTable;

    if (expression instanceof SQLFragment) {
      // another SQL fragment? recursively compile this one
      expression.compile(result, parentTable, currentColumn);

    } else if (typeof expression === 'string') {
      // if it's a string, it should be a x.Table or x.Column type, so just needs quoting (split on `.`);
      // a well-formed quoted name (`"a"`, `"s".t."c"`) is written as is; otherwise a `"` is doubled as
      // quote_ident does, so it cannot close its quotes, unless the name already compiled to quoted
      // identifiers only (`a""b`, a hand-escaped `a"b`), which is written as before
      const quoted = `"${expression.replace(/[.]/g, '"."')}"`;
      result.text += quotedName.test(expression) ? expression :
        !expression.includes('"') || quotedIdentifiers.test(quoted) ? quoted :
          `"${expression.replace(/"/g, '""').replace(/[.]/g, '"."')}"`;

    } else if (expression instanceof DangerousRawString) {
      // Little Bobby Tables passes straight through ...
      result.text += expression.value;

    } else if (Array.isArray(expression)) {
      // an array's elements are compiled one by one -- note that an empty array can be used as a non-value
      for (let i = 0, len = expression.length; i < len; i++) this.compileExpression(expression[i], result, parentTable, currentColumn);

    } else if (expression instanceof Parameter) {
      // parameters become placeholders, and a corresponding entry in the values array
      const
        placeholder = '$' + String(result.values.length + 1),  // 1-based indexing
        config = getConfig();

      if (
        ((expression.cast !== false && (expression.cast === true || config.castArrayParamsToJson)) &&
          Array.isArray(expression.value)) ||
        ((expression.cast !== false && (expression.cast === true || config.castObjectParamsToJson)) &&
          isPOJO(expression.value))
      ) {
        result.values.push(JSON.stringify(expression.value));
        result.text += `CAST(${placeholder} AS "json")`;

      } else if (typeof expression.cast === 'string') {
        // array bounds at the end (`[]`, `[3]`) are written after the type; they are found from the end,
        // as a regex would be quadratic on a long run of `[]`
        const cast = expression.cast;
        let end = cast.length;
        while (cast[end - 1] === ']') {
          const open = cast.lastIndexOf('[', end - 2);
          if (open < 0 || !/^[0-9]*$/.test(cast.slice(open + 1, end - 1))) break;
          end = open;
        }
        // without a `"`, the type is split on `.` and each part quoted (`public.mood`); otherwise it
        // passes as is if well-formed once quoted (`pg_catalog"."int4`, as before) or already quoted
        // (`"a.b"`); anything else is one quoted identifier, any `"` doubled as quote_ident does, so it
        // cannot close its quotes. No part is unquoted: `char` stays `"char"`, as before
        const
          name = cast.slice(0, end),
          type =
            !name.includes('"') ? `"${name.replace(/[.]/g, '"."')}"` :
              quotedIdentifiers.test(`"${name}"`) ? `"${name}"` :
                quotedIdentifiers.test(name) ? name :
                  `"${name.replace(/"/g, '""')}"`;

        result.values.push(expression.value);
        result.text += `CAST(${placeholder} AS ${type}${cast.slice(end)})`;

      } else {
        result.values.push(expression.value);
        result.text += placeholder;
      }

    } else if (expression === Default) {
      // a column default
      result.text += 'DEFAULT';

    } else if (expression === self) {
      // alias to the latest column, if applicable
      if (!currentColumn) throw new Error(`The 'self' column alias has no meaning here`);
      this.compileExpression(currentColumn, result);

    } else if (expression instanceof ParentColumn) {
      // alias to the parent table (plus optional supplied column name) of a nested query, if applicable
      if (!parentTable) throw new Error(`The 'parent' table alias has no meaning here`);
      this.compileExpression(parentTable, result);
      result.text += '.';
      this.compileExpression(expression.value ?? currentColumn!, result);

    } else if (expression instanceof ColumnNames) {
      // a ColumnNames-wrapped object -> quoted names in a repeatable order
      // OR a ColumnNames-wrapped array -> quoted array values
      const columnNames = Array.isArray(expression.value) ? expression.value :
        Object.keys(expression.value).sort();

      for (let i = 0, len = columnNames.length; i < len; i++) {
        if (i > 0) result.text += ', ';
        this.compileExpression(String(columnNames[i]), result);
      }

    } else if (expression instanceof ColumnValues) {
      // a ColumnValues-wrapped object OR array
      // -> values (in ColumnNames-matching order, if applicable) punted as SQLFragments or Parameters

      if (Array.isArray(expression.value)) {
        const values: any[] = expression.value;
        for (let i = 0, len = values.length; i < len; i++) {
          const value = values[i];
          if (i > 0) result.text += ', ';
          // a set currentColumn means we are in a Whereable (`isIn`), where there is no default, and `self` is no value
          if (value === Default && currentColumn) throw new Error(defaultInWhereable);
          if (value === self && currentColumn) throw new Error(selfInWhereable);
          if (isWrapper(value) && currentColumn) throw new Error(wrapperInWhereable);
          if (value instanceof SQLFragment ||
            value instanceof Parameter ||
            value === Default) this.compileExpression(value, result, parentTable);
          // parent() is the parent column, as in a `sql` template; with no column, the column of the filter
          else if (value instanceof ParentColumn) this.compileExpression(value, result, parentTable, currentColumn);
          else this.compileExpression(new Parameter(value), result, parentTable);
        }

      } else {
        const
          columnNames = <Column[]>Object.keys(expression.value).sort(),
          columnValues = columnNames.map(k => (<any>expression.value)[k]);

        for (let i = 0, len = columnValues.length; i < len; i++) {
          const
            columnName = columnNames[i],
            columnValue = columnValues[i];
          if (i > 0) result.text += ', ';
          // raw(), cols() and vals() are no values here, the writes of insert(), upsert() and update() included;
          // parent() is the parent column, as in vals([…]), and throws outside a nested query, as every write is
          if (isWrapper(columnValue)) throw new Error(wrapperAsValue);
          if (columnValue instanceof SQLFragment ||
            columnValue instanceof Parameter ||
            columnValue instanceof ParentColumn ||
            columnValue === Default) this.compileExpression(columnValue, result, parentTable, columnName);
          else this.compileExpression(new Parameter(columnValue), result, parentTable, columnName);
        }
      }

    } else if (typeof expression === 'object') {
      if (expression === globalThis) throw new Error('Did you use `self` (the global object) where you meant `db.self` (the Zapatos value)? The global object cannot be embedded in a query.');
      if (expression !== null && isBuiltin(expression)) throw new Error(builtinWhereable(Object.getPrototypeOf(expression).constructor.name));

      // must be a Whereable object, so put together a WHERE clause
      const columnNames = <Column[]>Object.keys(expression).sort();

      if (columnNames.length) {  // if the object is not empty
        result.text += '(';
        for (let i = 0, len = columnNames.length; i < len; i++) {
          const
            columnName = columnNames[i],
            columnValue = (<any>expression)[columnName];
          if (i > 0) result.text += ' AND ';
          if (columnValue instanceof SQLFragment) {
            result.text += '(';
            this.compileExpression(columnValue, result, parentTable, columnName);
            result.text += ')';

          } else {
            // a Parameter is compiled as it is, with its cast; Zapatos 6.6.1 wrapped it in another one
            if (columnValue === Default) throw new Error(defaultInWhereable);
            if (columnValue === self) throw new Error(selfInWhereable);
            if (isWrapper(columnValue)) throw new Error(wrapperInWhereable);
            this.compileExpression(columnName, result);
            result.text += ` = `;
            this.compileExpression(columnValue instanceof ParentColumn || columnValue instanceof Parameter ? columnValue :
              new Parameter(columnValue), result, parentTable, columnName);
          }
        }
        result.text += ')';

      } else {
        // or if it is empty, it should always match
        result.text += 'TRUE';
      }

    } else {
      throw new Error(`Alien object while interpolating SQL: ${expression}`);
    }
  };
}
