/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import type {
  JSONSelectableForTable,
  SelectableForTable,
  WhereableForTable,
  InsertableForTable,
  UpdatableForTable,
  ColumnForTable,
  UniqueIndexForTable,
  SQLForTable,
  Insertable,
  Updatable,
  Whereable,
  Table,
  Column,
} from 'zapatos/schema';

import {
  AllType,
  all,
  SQL,
  SQLFragment,
  sql,
  cols,
  vals,
  raw,
  param,
  Default,
  self,
  Parameter,
  DangerousRawString,
  ColumnNames,
  ColumnValues,
  ParentColumn,
} from './core';

import {
  callerValue,
  completeKeysWithDefaultValue,
  identifier,
  isBuiltin,
  isPrimitive,
  isRefusedBuffer,
  mapWithSeparator,
  space,
} from './utils';

import { getConfig, ConfigTypes } from './config';
import type { PostgresInterval } from './date';


// A string has an iterator, a row none: a column named like a String member, of a type that member fits (`search`
// typed any, `length` a number), made any string a Whereable, an Updatable or an all-optional Insertable (#674).
// Looked up per table, so that a generic forwarder's `{ ...where, id }` still relates to it table by table, where
// `WhereableForTable<T> & NotIterable` refused it; not exported, nor in the generated lookups, whose keys stay as they were
type NotIterable = { [Symbol.iterator]?: undefined };
type WhereableArg<T extends Table> = { [K in Table]: WhereableForTable<K> & NotIterable }[T];
type UpdatableArg<T extends Table> = { [K in Table]: UpdatableForTable<K> & NotIterable }[T];
type InsertableArg<T extends Table> = { [K in Table]: InsertableForTable<K> & NotIterable }[T];

export type JSONOnlyColsForTable<T extends Table, C extends readonly any[] /* `ColumnForTable<T>[]` gives errors here for reasons I haven't got to the bottom of */> =
  Pick<JSONSelectableForTable<T>, C[number]>;

export interface SQLFragmentMap { [k: string]: SQLFragment<any> }
export interface SQLFragmentOrColumnMap<T extends Table> { [k: string]: SQLFragment<any> | ColumnForTable<T> }
// the type a typed min() or max() has nested in a query, as JSON, where it differs from what run() gives;
// read unless ConfigTypes asks for the 6.x signatures, and behind `unknown extends RunResult`, so `any` gives `unknown` on TS 4.1 and `{} | null` from TS 5.x
declare const nestedResult: unique symbol;

/**
 * A column-typed `min()` or `max()`: with the default runtime setting, `run()` gives the pg value.
 * A single lateral of `selectOne()`, `selectExactlyOne()` or `selectRows()` also gives the pg value.
 * `ConfigTypes` selects the types: `RunResult` there, `NestedResult` for JSON under a lateral key,
 * in `extras` or under `select()`. Nest the original fragment for JSON. A `.copy()` returns a plain
 * `SQLFragment` with the direct type (e.g. `Date | null` for a date returned as a JSON string).
 * The original fragment's own members name a symbol `zapatos/db` does not export,
 * so a package built with `declaration: true` cannot write them out (TS4023 on a
 * spread of `min()`); it can name the type itself, as a function returning `min()` does.
 */
export interface ColumnAggregateFragment<RunResult, NestedResult> extends SQLFragment<RunResult> { [nestedResult]: NestedResult }

export type RunResultForSQLFragment<T extends SQLFragment<any, any>> = T extends SQLFragment<infer RunResult, any> ?
  (TypedByColumn extends true ? NestedResultOf<T, RunResult> : undefined extends RunResult ? NonNullable<RunResult> | null : RunResult) :
  never;

type NestedResultOf<T, RunResult> = unknown extends RunResult ? NonNullable<RunResult> | null :
  T extends { [nestedResult]: infer N } ? N : undefined extends RunResult ? NonNullable<RunResult> | null : RunResult;

export type LateralResult<L extends SQLFragmentMap> = { [K in keyof L]: RunResultForSQLFragment<L[K]> };
export type ExtrasResult<T extends Table, E extends SQLFragmentOrColumnMap<T>> = { [K in keyof E]:
  E[K] extends SQLFragment<any> ? RunResultForSQLFragment<E[K]> : E[K] extends keyof JSONSelectableForTable<T> ? JSONSelectableForTable<T>[E[K]] : never;
};

export type ExtrasOption<T extends Table> = SQLFragmentOrColumnMap<T> | undefined;
export type ColumnsOption<T extends Table> = readonly ColumnForTable<T>[] | undefined;

type LimitedLateralOption = SQLFragmentMap | undefined;
type FullLateralOption = LimitedLateralOption | SQLFragment<any>;
// constraints that only gate the conditional: ColumnsOption<Table> made each generic `L extends LateralOption<C, E>`
// relate C to the union of every column name, seconds on a large schema; SQLFragmentOrColumnMap<any> would break a
// schema with no table, where any is no Table (#918, note 016)
export type LateralOption<
  C extends readonly string[] | undefined,
  E extends { [k: string]: SQLFragment<any> | string } | undefined,
> =
  undefined extends C ? undefined extends E ? FullLateralOption : LimitedLateralOption : LimitedLateralOption;

export interface ReturningOptionsForTable<T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>> {
  returning?: C;
  extras?: E;
};

export type ReturningTypeForTable<T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>> =
  (undefined extends C ? JSONSelectableForTable<T> :
    C extends readonly ColumnForTable<T>[] ? JSONOnlyColsForTable<T, C> :
    never) &
  (undefined extends E ? {} :
    E extends SQLFragmentOrColumnMap<T> ? ExtrasResult<T, E> :
    never);


// a fragment that throws as it compiles, so that run() rejects before any query, and so does a copy nested in a
// lateral, which shares its expressions
function refusedSQL(message: string) {
  const refused = sql``;
  refused.compile = () => { throw new Error(message); };
  return refused;
}

// `null` from JavaScript, past the type, where Zapatos 6.6.1 threw a TypeError at the call: it has no meaning here
const
  columnsNull = '`columns: null` has no meaning: for every column, leave `columns` out; for some, give an array of their names.',
  returningNull = '`returning: null` has no meaning: for every column, leave `returning` out; for some, give an array of their names.',
  extrasNull = '`extras: null` has no meaning: for no extras, leave `extras` out; to add some, give an object of them.',
  orderNull = '`order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them.',
  lockNull = '`lock: null` has no meaning: for no lock, leave `lock` out; to lock, give it `{ for }`, or an array of them.';

// `db.all` as the filter of a write, past the type, which leaves it out so that a read's "every row" never reaches a
// write by accident; Zapatos 6.6.1 threw a TypeError from the "Alien object" message
const
  allAsWriteFilter = '`db.all` has no meaning as the filter of `deletes()` or `update()`: it is the filter of `select()` and its kin, refused in a write so that a filter that falls back to it for a read never deletes or updates every row. To delete or update every row on purpose, give db.sql`TRUE` as the filter.',
  writeFilter = (where: Whereable | SQLFragment<any>) => (where as unknown) === all ? refusedSQL(allAsWriteFilter) : where;

function SQLForColumnsOfTable(columns: readonly Column[] | undefined, table: Table, nullMessage: string) {
  return columns === undefined ? sql`to_jsonb(${table}.*)` :
    columns === null ? refusedSQL(nullMessage) :
      sql`jsonb_build_object(${mapWithSeparator(columns, sql`, `, c => sql`${param(c)}::text, ${c}`)})`;
}

// one double-quoted identifier, as Postgres lexes it: `"a"`, `"a""b"` (core.ts also allows dotted ones)
const quotedIdentifier = /^"(?:[^"\0]|"")+"$/;

// an alias of our own (`"lateral_<key>"`, `"sq_<alias>"`) is one identifier, not split on `.`; a `"` is
// doubled as quote_ident does, so it cannot close its quotes, unless the alias already compiled to one
// quoted identifier (`a""b`), which is written as before. A select() alias that is no string (an array, a fragment) is
// converted once, toString() first, as Zapatos 6.6.1 converted it, and that string is checked and written: its own
// replace() is never called
function SQLForAlias(prefix: string, name: string) {
  const text = `${name}`, quoted = `"${prefix}${text}"`;
  return raw(quotedIdentifier.test(quoted) ? quoted : `"${prefix}${text.replace(/"/g, '""')}"`);
}

// the queries select() returns (so selectOne(), selectExactlyOne(), count() and the other aggregates), and their
// copies, are written in parentheses where they stand for a value, a scalar subquery, where Zapatos 6.6.1 wrote them
// bare, which Postgres refuses (42601): in extras, in jsonb_build_object() (#262), and as an insert(), upsert() or
// update() value, in VALUES and ROW() (#656). A sql fragment is the caller's SQL, written as given
const isQuery = (x: unknown) => x instanceof SQLFragment && x['parenthesisedInExtras'];
// the query a shortcut compiles to on its own, which withCTEs() writes at the top level too: the LIMIT 2 form of a
// selectExactlyOne() that checks for a second row, or the rows form of a select() with topLevelSelectAsRows, which
// runs with rowsResult
const topLevelForm = Symbol('topLevelForm');
type TopLevelFormed = { [topLevelForm]?: SQLFragment<any, any> };
const rowsResult = (qr: { rows: any[] }) => qr.rows.map(r => r.result);
// set by select() and its kin on the runResultTransform of a query whose result is `json`, as shortcutsUseJson
// builds it: a parent's plain DISTINCT over it as a passed-through lateral compares it as `jsonb` (json has no
// equality, 42883), where an aggregate's or a `jsonb` result is compared as it is. Each query gets a transform of its
// own, which copy() and so withCTEs() keep, where they do not keep topLevelForm; a sql fragment given a query's
// transform is the caller's SQL, and is read only on a query (isQuery)
const jsonResult = Symbol('jsonResult');
type JSONResult = { [jsonResult]?: boolean };
const asScalar = <X>(x: X) => isQuery(x) ? sql`(${x as SQLFragment<any>})` : x;
// a row of entries, a query among its values in parentheses
const withScalarQueries = (entries: [string, unknown][]) => Object.fromEntries(entries.map(([k, v]) => [k, asScalar(v)]));

function SQLForExtras<T extends Table>(extras: ExtrasOption<T>) {
  return extras === undefined ? [] :
    extras === null ? refusedSQL(extrasNull) :
    sql` || jsonb_build_object(${mapWithSeparator(
      Object.keys(extras), sql`, `, k => sql`${param(k)}::text, ${asScalar(extras[k])}`)})`;
}

// with shortcutsUseJson (decision 018 § 2), json having no `||`, a row of `columns` takes its columns, extras and
// lateral keys in one json_build_object(), whose arguments Postgres limits to 100 (max_function_args; 54023 beyond),
// where each part takes a jsonb_build_object() of its own without the option; a write's `returning`, extras and
// $action the same. A key is a parameter, every caller's key included (a fragment past the type), but one flagged as
// ours (`$action`), written as a literal
const maxJSONKeys = 50;
function SQLForJSONObject(pairs: [string, SQL, ours?: true][], parts = 'columns, extras and lateral keys') {
  return pairs.length > maxJSONKeys ? refusedSQL(`\`shortcutsUseJson\` builds this row with one \`json_build_object()\`, which Postgres limits to 100 arguments: its ${pairs.length} keys (${parts} together) take ${pairs.length * 2}. Give ${maxJSONKeys} keys at most, or set \`shortcutsUseJson: false\`, under which ${parts} take one \`jsonb_build_object()\` each.`) :
    sql`json_build_object(${mapWithSeparator(pairs, sql`, `, ([k, v, ours]) => sql`${ours ? raw(`'${k}'`) : sql`${param(k)}::text`}, ${v}`)})`;
}

// with shortcutsUseJson, an extras or lateral key beside every column is a column alias, as to_json() names its keys
// after the columns: one quoted identifier, every `"` doubled, so that it comes back as given (SQLForAlias keeps a
// hand-escaped `a""b`, which would come back as `a"b`), never split on `.`. Postgres refuses an empty one (42601) and
// a NUL (08P01), and truncates one over 63 bytes (NAMEDATALEN) with only a NOTICE: refused as the query compiles
function SQLForKeyAlias(key: string, list: 'columns' | 'returning' = 'columns') {
  const
    text = `${key}`,
    bytes = Buffer.byteLength(text),
    problem = text === '' ? 'it is empty' : text.includes('\0') ? 'it holds a NUL' : bytes > 63 ? `it takes ${bytes} bytes in UTF-8, over Postgres's 63` : undefined;
  return problem === undefined ? raw(`"${text.replace(/"/g, '""')}"`) :
    refusedSQL(`The key ${JSON.stringify(text)} cannot be a column alias, which \`shortcutsUseJson\` makes of an ${list === 'columns' ? '`extras` or `lateral` key' : '`extras` key'} beside every column: ${problem}. Give \`${list}\`, whose keys stay parameters, or set \`shortcutsUseJson: false\`.`);
}

// the RETURNING list of insert(), upsert() (with `$action`, unless suppressed), update() and deletes(), `… AS result`.
// With shortcutsUseJson (decision 018 § 2), json having no `||`, every column beside extras or $action is to_json() of
// a scalar subquery's row, whose column aliases name the keys, and `returning` beside them one json_build_object()
function SQLForReturning(table: Table, options: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>> | undefined, reportAction = false) {
  const
    returning = callerValue(options, 'returning'),
    extras = callerValue(options, 'extras'),
    action = sql`CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END`;
  if (!(getConfig().shortcutsUseJson ?? false)) return sql`${SQLForColumnsOfTable(returning, table, returningNull)}${SQLForExtras(extras)}${reportAction ? sql` || jsonb_build_object('$action', ${action})` : []} AS result`;
  const
    keys = extras == null ? [] : Object.keys(extras),
    row = SQLForAlias('row_', table),
    json = returning === null ? refusedSQL(returningNull) :
      extras === null ? refusedSQL(extrasNull) :
      returning !== undefined ? SQLForJSONObject([
        ...returning.map((c): [string, SQL] => [c, c]),
        ...keys.map((k): [string, SQL] => [k, asScalar(extras![k])]),
        ...(reportAction ? [['$action', action, true] as [string, SQL, true]] : []),
      ], '`returning`, `extras` and `$action`') :
      keys.length === 0 && !reportAction ? sql`to_json(${table}.*)` :
      sql`(SELECT to_json(${row}.*) FROM (SELECT ${table}.*${keys.map(k => sql`, ${asScalar(extras![k])} AS ${SQLForKeyAlias(k, 'returning')}`)}${reportAction ? sql`, ${action} AS "$action"` : []}) AS ${row})`;
  return sql`${json} AS result`;
}


// an undefined value is a missing key: `toDefault` sends DEFAULT (insert), otherwise the
// key goes (update, upsert, whose missing keys then take DEFAULT, and the rule of rows with different keys);
// a null row, which an untyped caller may pass among others, is read as `{}`, as completeKeysWithDefaultValue reads it,
// and a primitive one, a Buffer (its values, one per byte, unlisted) and a built-in with no own enumerable key are
// kept as they are, for cols() or vals() to refuse. A lone row's values are read once here, as before, and a query
// among them is written in parentheses, in a copy (several rows: see completedRows)
function undefinedAsMissing<V extends object>(values: V, toDefault: boolean): V {
  const
    rows: object[] = (Array.isArray(values) ? values : [values]).map(row => row ?? {}),
    lone = Array.isArray(values) || isRefusedBuffer(rows[0]) ? undefined : Object.entries(rows[0]),
    asGiven = lone?.some(([, v]) => isQuery(v)) ? withScalarQueries(lone) as V : values;
  if (!(lone ? lone.some(([, v]) => v === undefined) : rows.some(row => !isRefusedBuffer(row) && Object.values(row).includes(undefined)))) return asGiven;
  const kept = rows.map(row => {
    if (isPrimitive(row) || isRefusedBuffer(row)) return row;
    const entries = Object.entries(row);
    return entries.length === 0 && isBuiltin(row) ? row : Object.fromEntries(entries.flatMap(([k, v]) =>
      v !== undefined ? [[k, asScalar(v)]] : toDefault ? [[k, Default]] : []));
  });
  return (Array.isArray(values) ? kept : kept[0]) as V;
}

// several rows, their keys completed with DEFAULT, in copies, where a query among the values is written in parentheses;
// a row completeKeysWithDefaultValue leaves as it is (a primitive, a Buffer, a built-in with no own key) holds none
const completedRows = <R extends object>(rows: R[]) => completeKeysWithDefaultValue(rows, Default).map((row, i) =>
  row !== rows[i] && Object.values(row).some(isQuery) ? withScalarQueries(Object.entries(row)) as R : row);

// the keys of upsert()'s updateValues that join the update: an undefined one is set from EXCLUDED, as in 6.6.1,
// so if no row inserts its column, an existing row takes the column DEFAULT; an undefined one is a
// missing key, so it adds no column (`updated`: updateColumns, or the columns inserted, set from EXCLUDED either
// way); the object itself is kept, as its values are still read through getters and prototypes
function updateValuesKeys(updateValues: { [k: string]: any }, updated: string[]): string[] {
  const keys = Object.keys(updateValues);
  if (!keys.some(k => updateValues[k] === undefined && !updated.includes(k))) return keys;
  return keys.filter(k => updateValues[k] !== undefined);
}


/* === insert === */

// `INSERT INTO t () VALUES ()` is a syntax error in Postgres, and DEFAULT VALUES has no form for several rows,
// so say so before any query, as update() does
const nothingToInsert = 'nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template';

// a Buffer's bytes are its keys, so one with bytes has keys, which are not listed: one per byte, a long one took seconds;
// undefinedAsMissing leaves a Buffer as it is, so for update() and upsert() (`undefinedIsMissing`),
// an empty one's undefined keys are left out here, as from the `{}` it rebuilt one into before
// #543: "nothing to update" or "nothing to insert" is still thrown at the call
const hasOwnKey = (row: object, undefinedIsMissing = false) => {
  if (!isRefusedBuffer(row)) return Object.keys(row).length > 0;
  if ((row as Buffer).length > 0) return true;
  return undefinedIsMissing ?
    Object.values(row).some(v => v !== undefined) : Object.keys(row).length > 0;
};

// the signatures of insert(), upsert(), update() and truncate() are written in place, not as an unexported interface,
// so that a package built with `declaration: true` can re-export them (TS4023)
/**
 * Generate an `INSERT` query `SQLFragment`.
 * @param table The table into which to insert
 * @param values The `Insertable` values (or array thereof, `readonly` too) to be inserted.
 * They need at least one column: a row with no key, or rows with none between
 * them, throw before any query (for a row of defaults, `DEFAULT VALUES` in a
 * `sql` template). A `null` row given on its own, not in an array, or a
 * primitive row (a string, a number…) throws as the query compiles, so `run()`
 * rejects before any query, and so does a `Buffer` row with bytes or keys,
 * alone in an array too, or a built-in row with no own enumerable key (a
 * `Date`, a `Map`…) beside a row with keys, which
 * `upsert()` refuses too; a `null` row in an array gives `DEFAULT` for each
 * column of the others. An `undefined` value sends `DEFAULT`, as a missing
 * cell does: `{ title: undefined }` gives `VALUES (DEFAULT)`; for SQL `NULL`,
 * give `null`.
 * These rules apply to the values read at the call, provided they stay unchanged
 * until the query runs and getters return the same value on later reads.
 * A shortcut's query (`count()`, `selectOne()`…) or its `copy()` is written in parentheses,
 * a scalar subquery, and stores what it gives in `extras`:
 * `VALUES ((SELECT count(*) AS result FROM "films"))`.
 * @param options Optionally, `returning` (an array of columns) and `extras`;
 * `null` is none, and either set to `null` throws as the query compiles, so
 * `run()` rejects before any query, unless `values` is an empty array, a no-op
 * (a row with no key throws first, at the call)
 */
export const insert: {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: InsertableArg<T>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>>;

  // a readonly array of rows, which a mutable one fits too; the mutable overload stays last, as the one that
  // Parameters and ReturnType read (#683)
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: readonly InsertableArg<T>[],
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;

  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: InsertableArg<T>[],
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
} = function (
  table: Table,
  values: Insertable | Insertable[],
  options?: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>>
): SQLFragment<any> {

  let query;
  if (Array.isArray(values) && values.length === 0) {
    query = sql`INSERT INTO ${table} SELECT null WHERE false`;
    query.noop = true;
    query.noopResult = [];

  } else {
    values = undefinedAsMissing(values, true);
    const
      completedValues = Array.isArray(values) ? completedRows(values) : values,
      firstRow = Array.isArray(completedValues) ? completedValues[0] : completedValues,
      anyPrimitive = Array.isArray(completedValues) ? completedValues.some(isPrimitive) : isPrimitive(firstRow),
      colsSQL = cols(firstRow),
      valuesSQL = Array.isArray(completedValues) ?
        mapWithSeparator(completedValues as Insertable[], sql`, `, v => sql`(${vals(v)})`) :
        sql`(${vals(completedValues)})`,
      returningSQL = SQLForReturning(table, options);

    // a null row on its own, or a primitive row anywhere, fails in compile(), in cols() or vals(), so run() rejects;
    // so does a built-in row completeKeysWithDefaultValue leaves, unless no row has a key
    if (firstRow != null && !anyPrimitive && !(Array.isArray(completedValues) ? completedValues : [firstRow]).some(row => hasOwnKey(row))) throw new Error(nothingToInsert);
    query = sql`INSERT INTO ${table} (${colsSQL}) VALUES ${valuesSQL} RETURNING ${returningSQL}`;
  }

  query.runResultTransform = Array.isArray(values) ?
    (qr) => qr.rows.map(r => r.result) :
    (qr) => qr.rows[0].result;

  return query;
};


/* === upsert === */

/**
 * Wraps a unique index of the target table for use as the arbiter constraint
 * of an `upsert` shortcut query.
 */
export class Constraint<T extends Table> { constructor(public value: UniqueIndexForTable<T>) { } }
/**
 * Returns a `Constraint` instance, wrapping a unique index of the target table
 * for use as the arbiter constraint of an `upsert` shortcut query.
 *
 * Held in a variable, `constraint('...')` accepts any table's name.
 * `constraint<'users'>('users_pkey')` checks the name against `users`.
 * Postgres looks up the target table's own constraint, even for a shared name.
 * A missing constraint gives 42704. A constraint with no arbiter index, such
 * as a `CHECK` sharing a bare index's name, gives 42809.
 *
 * The generator lists the table's valid, non-deferrable unique and
 * primary-key constraints usable with `DO UPDATE`. A partitioned table's union
 * follows the parent constraint. Postgres checks the receiving partition's index,
 * so a deferrable key there can raise 55000. A deferrable parent key is omitted
 * even when the partitions' keys are immediate.
 */
export function constraint<T extends Table>(x: UniqueIndexForTable<T>) { return new Constraint<T>(x); }

export interface UpsertAction { $action: 'INSERT' | 'UPDATE' }

type UpsertReportAction = 'suppress';
export type UpsertReturnableForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  E extends ExtrasOption<T>,
  RA extends UpsertReportAction | undefined
> =
  ReturningTypeForTable<T, C, E> & (undefined extends RA ? UpsertAction : {});

type UpsertConflictTargetForTable<T extends Table> = Constraint<T> | ColumnForTable<T> | ColumnForTable<T>[];
type UpdateColumns<T extends Table> = ColumnForTable<T> | ColumnForTable<T>[];
// updateValues are compiled as in a `sql` template, so raw(), cols() and vals() are SQL there, where an Updatable
// value refuses them (they throw as insert() and update() values). Each is taken where 6.6.1 took it as
// the column's Parameter<V> ({ value: V }): raw() if V takes a string, cols(x) and vals(x) of V, but for a
// primitive x, which throws while compiling (#244, #503), and for a Date, a Buffer (a Uint8Array) or an interval
// object, which compile their own keys: none for a Date, `ROW(…, )`, and for a one-byte Buffer the number of its byte (#514).
// No more: a wider member (raw() on an int column, cols() of any) would widen the inferred type of param(x) beside
// it, so that param('1') or param('2020-01-01') no longer fit their column
type ParameterValue<X> = X extends Parameter<infer V> ? V : never;
// Where V holds only these, V branded with a key no value has, which an argument typed any still fits, as under 6.6.1.
// A subtype of V, so that param('sad') beside it infers its literal from V whatever TypeScript resolved first, where
// a type of its own was a second candidate, and TypeScript 5.9 picked one of the two by the order it made them (#538).
// An object type, not a unique symbol: a consumer's .d.ts can write it out, where it cannot name an unexported symbol
type NoValue<V> = V & { readonly 'pgcast: no value': never };
type WrappedValue<X, W = Exclude<ParameterValue<X>,
  string | number | boolean | bigint | symbol | null | undefined | Date | Uint8Array | PostgresInterval>> =
  [W] extends [never] ? NoValue<ParameterValue<X>> : W;
type UpdateValuesForTable<T extends Table, U = UpdatableForTable<T>> = {
  [K in keyof U]: U[K] | ColumnValues<WrappedValue<U[K]>> | ColumnNames<WrappedValue<U[K]>> |
    (string extends ParameterValue<U[K]> ? DangerousRawString : never)
};

/**
 * The `options` of `upsert()`: `returning` and `extras`, as for `insert()`, with `updateValues`, `updateColumns`,
 * `noNullUpdateColumns` and `reportAction`.
 */
export interface UpsertOptions<
  T extends Table,
  C extends ColumnsOption<T>,
  E extends ExtrasOption<T>,
  UC extends UpdateColumns<T> | undefined,
  RA extends UpsertReportAction | undefined,
> extends ReturningOptionsForTable<T, C, E> {
  // while T is a type parameter, TypeScript relates no object to a type mapped over it, but it checks a lookup by T
  // against T's tables on write: so 6.6.1's own type first, then the mapped type looked up per table (#533).
  // Its keys remapped (`as K`), or TypeScript rewrites the lookup as the type mapped over T, whose raw() member, a
  // conditional it cannot resolve, widens param('sad') to a string while T is generic, and over every table (#538)
  updateValues?: UpdatableForTable<T> | { [K in Table as K]: UpdateValuesForTable<K> }[T];
  updateColumns?: UC;
  noNullUpdateColumns?: ColumnForTable<T> | ColumnForTable<T>[] | typeof all;
  /**
   * `'suppress'` leaves `$action` out of the SQL and of the type. A partitioned
   * table needs it when a row lands in a partition whose columns sit where the
   * table's do: the same columns in the same order, as `PARTITION OF` gives
   * unless the table already had a dropped column, or as a table made with
   * `CREATE TABLE` and then attached can have. Postgres reads no `xmax` there,
   * and rejects the query with 0A000, "cannot retrieve a system column in this
   * context", as with Zapatos 6.6.1. A row that lands in a partition with its
   * columns in another order reports `$action`, as does an upsert into the
   * partition itself.
   */
  reportAction?: RA;
}

export const doNothing = [];

// a plain value is sent as a parameter, as `vals()` sends it; a value that holds one of our own objects
// (`sql`, `param`, `raw`, `cols`, `vals`, `parent`, a symbol such as `Default` or `self`) anywhere in its
// arrays and plain objects is compiled as in a `sql` template; so is a function or the global object where
// a `sql` template throws on it, alone or as an array item, but not as the value of an object's key, which
// a `sql` template sends as a parameter (a `toPostgres()` method, say). A plain object is then a Whereable,
// where a `Parameter` is compiled as it is and `Default` throws, unlike 6.6.1 (#31)
const compiledAsIs = (value: any, inObject = false): boolean =>
  typeof value === 'function' || value === globalThis ? !inObject :
    value instanceof SQLFragment || value instanceof Parameter || value instanceof DangerousRawString ||
    value instanceof ColumnNames || value instanceof ColumnValues || value instanceof ParentColumn ||
    typeof value === 'symbol' ||
    (Array.isArray(value) ? value.some(item => compiledAsIs(item, inObject)) :
      typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      Object.values(value).some(item => compiledAsIs(item, true)));

// `all` or `self` alone throws as in the other writes, through vals({…}), where it threw a message that said nothing
// to write: "Alien object" (a TypeError under 6.6.1) or "The 'self' column alias has no meaning here"
const updateValueSQL = (value: any, column: string) =>
  value === all || value === self ? vals({ [column]: value }) : compiledAsIs(value) ? asScalar(value) : param(value);

/**
 * Generate an 'upsert' (`INSERT ... ON CONFLICT ...`) query `SQLFragment`.
 * @param table The table to update or insert into
 * @param values An `Insertable` of values (or an array thereof, `readonly` too) to be inserted 
 * or updated; as for `insert`, they need at least one column, or it throws
 * before any query, and a shortcut's query is written in parentheses
 * @param conflictTarget A `UNIQUE`-indexed column (or array thereof) or a 
 * `UNIQUE` index (wrapped in `db.constraint(...)`) that determines whether we
 * get an `UPDATE` (when there's a matching existing value) or an `INSERT`
 * (when there isn't); the type does not check that a `constraint()` is one of
 * this table's (see `constraint`)
 * @param options Optionally, an object with any of the keys `updateColumns`,
 * `noNullUpdateColumns` and `updateValues` (see documentation), and
 * `returning` and `extras`, as for `insert`. A plain value
 * in `updateValues` is sent as a parameter: `{ mood: 'happy' }` gives
 * `ROW(..., $n)`, and a shortcut's query in parentheses, as for `insert`.
 * To read a column there, use a fragment, which is written as
 * it is: ``{ name: db.sql`${'users'}.${'name'}` }`` gives `ROW(..., "users"."name")`.
 * An `updateColumns` array that is empty at run time, with no `updateValues`
 * key (a key set to `undefined` is none), gives
 * `DO NOTHING`, as `doNothing` does: one row that conflicts then
 * returns `undefined`, which the type of a `Column[]` does not say; check for
 * it, or pass `doNothing`, which the type follows.
 *
 * Without `updateColumns`, the call throws if an implicitly updated column is
 * missing from any row, even with `noNullUpdateColumns`. Give every row the key, name the columns
 * to update, or supply a defined override in `updateValues`. Columns named
 * in `conflictTarget` are exempt: a new row may omit its serial `id` when
 * upserting on `'id'`. A constraint target does not identify its columns here.
 *
 * An `undefined` value is a missing key in both the row and `updateValues`.
 * The row omits the column unless another row supplies it, in which case its
 * cell takes `DEFAULT`. A row or batch left with no columns throws.
 * In `updateValues`, `{ votes: undefined }` adds no column to `DO UPDATE SET`.
 * A defined `updateValues` override wins. Otherwise a selected column takes
 * its value from `EXCLUDED`, with a `CASE` for `noNullUpdateColumns` that
 * keeps the stored value if the incoming value is SQL `NULL`.
 * These rules apply to the values read at the call, provided they stay unchanged
 * until the query runs and getters return the same value on later reads.
 */
export const upsert: {
  <T extends Table,
    C extends ColumnsOption<T>,
    E extends ExtrasOption<T>,
    UC extends UpdateColumns<T> | undefined,
    RA extends UpsertReportAction | undefined
  >(
    table: T,
    values: InsertableArg<T>,
    conflictTarget: UpsertConflictTargetForTable<T>,
    options?: UpsertOptions<T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnableForTable<T, C, E, RA> | (UC extends never[] ? undefined : never)>;

  // as for insert(): a readonly array of rows, then the mutable overload, kept last (#683)
  <T extends Table,
    C extends ColumnsOption<T>,
    E extends ExtrasOption<T>,
    UC extends UpdateColumns<T> | undefined,
    RA extends UpsertReportAction | undefined
  >(
    table: T,
    values: readonly InsertableArg<T>[],
    conflictTarget: UpsertConflictTargetForTable<T>,
    options?: UpsertOptions<T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnableForTable<T, C, E, RA>[]>;

  <T extends Table,
    C extends ColumnsOption<T>,
    E extends ExtrasOption<T>,
    UC extends UpdateColumns<T> | undefined,
    RA extends UpsertReportAction | undefined
  >(
    table: T,
    values: InsertableArg<T>[],
    conflictTarget: UpsertConflictTargetForTable<T>,
    options?: UpsertOptions<T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnableForTable<T, C, E, RA>[]>;
} = function (
  table: Table,
  values: Insertable | Insertable[],
  conflictTarget: Column | Column[] | Constraint<Table>,
  options?: UpsertOptions<Table, ColumnsOption<Table>, ExtrasOption<Table>, UpdateColumns<Table>, UpsertReportAction>
): SQLFragment<any> {

  if (Array.isArray(values) && values.length === 0) return insert(table, values);  // punt a no-op to plain insert
  // punt a null or primitive row, alone or among others, or a Buffer row alone, to plain insert too, whose cols() or
  // vals() refuse it as the query compiles; a null row among others is read as `{}`, as insert reads it
  if (Array.isArray(values) && values.some(isPrimitive)) return insert(table, values);
  if (!Array.isArray(values) && isRefusedBuffer(values) && !hasOwnKey(values, true)) throw new Error(nothingToInsert);
  if (!Array.isArray(values) && (values == null || isPrimitive(values) || isRefusedBuffer(values))) return insert(table, values);
  if (typeof conflictTarget === 'string') conflictTarget = [conflictTarget];  // now either Column[] or Constraint
  values = undefinedAsMissing(values, false);

  let noNullUpdateColumns = callerValue(options, 'noNullUpdateColumns') ?? [];
  if (noNullUpdateColumns !== all && !Array.isArray(noNullUpdateColumns)) noNullUpdateColumns = [noNullUpdateColumns];

  let specifiedUpdateColumns = callerValue(options, 'updateColumns');
  if (specifiedUpdateColumns && !Array.isArray(specifiedUpdateColumns)) specifiedUpdateColumns = [specifiedUpdateColumns];

  const completedValues = Array.isArray(values) ? completedRows(values) : [values];
  // so is a built-in row among others, which completeKeysWithDefaultValue leaves as it is, where it copies the others;
  // an empty Buffer's undefined keys are left out first, as for one row (with no Buffer, insert() counts the same keys)
  if (Array.isArray(values) && completedValues.some((row, i) => row === (values as Insertable[])[i])) {
    if (completedValues.some(isRefusedBuffer) && !completedValues.some(row => hasOwnKey(row, true))) throw new Error(nothingToInsert);
    return insert(table, values);
  }
  const
    firstRow = completedValues[0],
    insertColsSQL = cols(firstRow),
    insertValuesSQL = mapWithSeparator(completedValues, sql`, `, v => sql`(${vals(v)})`),
    colNames = Object.keys(firstRow) as Column[],
    updateValues: Record<string, unknown> = options == null ? {} : callerValue(options, 'updateValues') ?? {},
    conflictColumns = Array.isArray(conflictTarget) ? conflictTarget : [],  // a constraint's are unknown here
    overwritesMissingKey = specifiedUpdateColumns == null && Array.isArray(values) && colNames.some(c =>
      callerValue(updateValues, c) === undefined &&  // as below: otherwise, c is set from EXCLUDED
      !conflictColumns.includes(c) &&  // on conflict, EXCLUDED.c equals the existing value
      values.some(v => !Object.prototype.propertyIsEnumerable.call(v ?? {}, c))),  // a null row misses every key
    updateColumns = [...new Set(  // deduplicate the keys here
      [...specifiedUpdateColumns as string[] ?? colNames, ...updateValuesKeys(updateValues, specifiedUpdateColumns as string[] ?? colNames)]
    )],
    conflictTargetSQL = Array.isArray(conflictTarget) ?
      sql`(${mapWithSeparator(conflictTarget, sql`, `, c => c)})` :
      sql<string>`ON CONSTRAINT ${conflictTarget.value}`,
    updateColsSQL = mapWithSeparator(updateColumns, sql`, `, c => c),
    updateValuesSQL = mapWithSeparator(updateColumns, sql`, `, c =>
      callerValue(updateValues, c) !== undefined ? updateValueSQL(callerValue(updateValues, c), c) :
        (noNullUpdateColumns === all || noNullUpdateColumns.includes(c as Column)) ? sql`CASE WHEN EXCLUDED.${c} IS NULL THEN ${table}.${c} ELSE EXCLUDED.${c} END` :
          sql`EXCLUDED.${c}`),
    suppressReport = callerValue(options, 'reportAction') === 'suppress',
    returningSQL = SQLForReturning(table, options, !suppressReport);

  if (colNames.length === 0) throw new Error(nothingToInsert);

  // a key missing from some row is inserted as DEFAULT, then `SET col = EXCLUDED.col` overwrites the existing
  // value: Postgres can't tell that DEFAULT from a given one, so only the caller knows which columns to update
  if (overwritesMissingKey) {
    throw new Error('rows have different keys: pass updateColumns, or give every row the same keys');
  }

  // the added-on $action = 'INSERT' | 'UPDATE' key takes after SQL Server's approach to MERGE
  // (and on the use of xmax for this purpose, see: https://stackoverflow.com/questions/39058213/postgresql-upsert-differentiate-inserted-and-updated-rows-using-system-columns-x)
  // a row routed to a partition whose columns sit where the parent's do is returned from the parent's virtual slot, which
  // has no system column, so Postgres refuses xmax (0A000): see tts_virtual_getsysattr in
  // https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/executor/execTuples.c

  const
    insertPart = sql`INSERT INTO ${table} (${insertColsSQL}) VALUES ${insertValuesSQL}`,
    conflictPart = sql`ON CONFLICT ${conflictTargetSQL} DO`,
    conflictActionPart = updateColsSQL.length > 0 ? sql`UPDATE SET (${updateColsSQL}) = ROW(${updateValuesSQL})` : sql`NOTHING`,
    returningPart = sql`RETURNING ${returningSQL}`,
    query = sql`${insertPart} ${conflictPart} ${conflictActionPart} ${returningPart}`;

  query.runResultTransform = Array.isArray(values) ?
    (qr) => qr.rows.map(r => r.result) :
    (qr) => qr.rows[0]?.result;

  return query;
};


/* === update === */

/**
 * Generate an `UPDATE` query `SQLFragment`.
 * @param table The table to update
 * @param values An `Updatable` of the new values with which to update the table.
 * It needs at least one key: with none, there is nothing to set, and `update()`
 * throws before any query. An `undefined` value leaves its key out:
 * `{ name: 'A', isLiving: undefined }` gives `SET ("name") = ROW($1)`; to set
 * its column to `NULL`, give `null`.
 * These rules apply to the values read at the call, provided they stay unchanged
 * until the query runs and getters return the same value on later reads.
 * A shortcut's query is written in parentheses, as for `insert`.
 * @param where A `Whereable` (or `SQLFragment`) defining which rows to update
 * (`db.all` throws: to touch every row, give `` sql`TRUE` ``)
 * @param options Optionally, `returning` and `extras`, as for `insert`
 */
export const update: {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: UpdatableArg<T>,
    where: WhereableArg<T> | SQLFragment<any>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
} = function (
  table: Table,
  values: Updatable,
  where: Whereable | SQLFragment<any>,
  options?: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>>
): SQLFragment {

  values = undefinedAsMissing(values, false);
  // `SET () = ROW()` is a syntax error in Postgres, so say so before any query; a null or primitive row fails in
  // compile(), in cols(), so run() rejects
  if (values != null && !isPrimitive(values) && !hasOwnKey(values, true)) throw new Error('nothing to update: an Updatable needs at least one column');

  // note: the ROW() constructor below is required in Postgres 10+ if we're updating a single column
  // more info: https://www.postgresql-archive.org/Possible-regression-in-UPDATE-SET-lt-column-list-gt-lt-row-expression-gt-with-just-one-single-column0-td5989074.html

  const
    returningSQL = SQLForReturning(table, options),
    query = sql`UPDATE ${table} SET (${cols(values)}) = ROW(${vals(values)}) WHERE ${writeFilter(where)} RETURNING ${returningSQL}`;

  query.runResultTransform = (qr) => qr.rows.map(r => r.result);
  return query;
};


/* === delete === */

export interface DeleteSignatures {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    where: WhereableArg<T> | SQLFragment<any>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
}

/**
 * Generate an `DELETE` query `SQLFragment` (plain 'delete' is a reserved word)
 * @param table The table to delete from
 * @param where A `Whereable` (or `SQLFragment`) defining which rows to delete
 * (`db.all` throws: to touch every row, give `` sql`TRUE` ``)
 * @param options Optionally, `returning` and `extras`, as for `insert`
 */
export const deletes: DeleteSignatures = function (
  table: Table,
  where: Whereable | SQLFragment<any>,
  options?: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>>
): SQLFragment {

  const
    returningSQL = SQLForReturning(table, options),
    query = sql`DELETE FROM ${table} WHERE ${writeFilter(where)} RETURNING ${returningSQL}`;

  query.runResultTransform = (qr) => qr.rows.map(r => r.result);
  return query;
};


/* === truncate === */

type TruncateIdentityOpts = 'CONTINUE IDENTITY' | 'RESTART IDENTITY';
type TruncateForeignKeyOpts = 'RESTRICT' | 'CASCADE';

/**
 * Generate a `TRUNCATE` query `SQLFragment`, whose `run()` resolves `undefined`.
 * @param table The table (or array thereof) to truncate
 * @param opts Options: 'CONTINUE IDENTITY'/'RESTART IDENTITY' and/or
 * 'RESTRICT'/'CASCADE', in that order; another order throws as the query
 * compiles, so `run()` rejects before any query is sent
 */
export const truncate: {
  (table: Table | Table[]): SQLFragment<undefined>;
  (table: Table | Table[], optId: TruncateIdentityOpts): SQLFragment<undefined>;
  (table: Table | Table[], optFK: TruncateForeignKeyOpts): SQLFragment<undefined>;
  (table: Table | Table[], optId: TruncateIdentityOpts, optFK: TruncateForeignKeyOpts): SQLFragment<undefined>;
} = function (
  table: Table | Table[],
  ...opts: string[]
): SQLFragment<undefined> {

  if (!Array.isArray(table)) table = [table];
  // without strictNullChecks, `undefined` or `null` gets past the type: join() makes it empty, as in 6.6.1
  for (const opt of opts) if (opt != null && !['CONTINUE IDENTITY', 'RESTART IDENTITY', 'RESTRICT', 'CASCADE'].includes(opt)) throw new Error(`Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '${opt}'`);
  // Postgres takes `[ RESTART IDENTITY | CONTINUE IDENTITY ] [ CASCADE | RESTRICT ]`, in that order (42601 otherwise):
  // https://www.postgresql.org/docs/current/sql-truncate.html. Another order throws as the query compiles, as the
  // aggregates' refusals do, so `run()` still rejects, as in 6.6.1, before any query
  const
    given = opts.filter(opt => opt != null),
    tables = mapWithSeparator(table, sql`, `, t => t),
    query = sql<SQL, undefined>`TRUNCATE ${tables}${raw((opts.length ? ' ' : '') + opts.join(' '))}`;

  query.runResultTransform = () => undefined;
  if (given.length <= 2 && (given.length < 2 || (given[0].endsWith('IDENTITY') && !given[1].endsWith('IDENTITY')))) return query;
  return sql<SQL, undefined>`${refusedSQL(`Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not ${given.map(opt => `'${opt}'`).join(', ')}`)}`;
};


/* === select === */

/** One item of `select()`'s `order`: `by`, then `direction`, then `NULLS <nulls>` if given (`"title" DESC NULLS LAST`). */
export interface OrderSpecForTable<T extends Table> {
  by: SQLForTable<T>;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

type Unprefixed<S extends string> = S extends `${infer _}.${infer Rest}` ? Rest : S;

// as in core.ts, for the lock option of SelectOptionsForTable
type NoInfer<T> = [T][T extends any ? 0 : never];

export interface SelectLockingOptions<A extends string> {
  for: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: Unprefixed<Table> | A | (Unprefixed<Table> | A)[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}

export interface SelectOptionsForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  L extends LateralOption<C, E>,
  E extends ExtrasOption<T>,
  A extends string,
> {
  distinct?: boolean | ColumnForTable<T> | ColumnForTable<T>[] | SQLFragment<any>;
  order?: OrderSpecForTable<T> | OrderSpecForTable<T>[];
  limit?: number;
  offset?: number;
  withTies?: boolean;
  columns?: C;
  extras?: E;
  groupBy?: ColumnForTable<T> | ColumnForTable<T>[] | SQLFragment<any>;
  having?: WhereableArg<T> | SQLFragment<any>;
  lateral?: L;
  alias?: A;
  lock?: SelectLockingOptions<NoInfer<A>> | SelectLockingOptions<NoInfer<A>>[];
};

// a single lateral query is passed through as it is by selectOne() and selectExactlyOne(), as JSON by select(),
// which wraps the rows in jsonb_agg(): the two types differ only for a typed min() or max(), when column typing is enabled
type PassedThroughResult<L extends SQLFragment<any>, M extends SelectResultMode> = TypedByColumn extends true ?
  (M extends SelectResultMode.Many ? RunResultForSQLFragment<L> :
    L extends SQLFragment<infer RunResult, any> ? (undefined extends RunResult ? NonNullable<RunResult> | null : RunResult) : never) :
  RunResultForSQLFragment<L>;

// by default, selectOne() and selectExactlyOne() keep the brand of the min() or max() they pass through, which
// comes back as JSON when nested in turn; not for `any` or `never`, nor for a lateral map, whose results are JSON already.
// An explicit false declaration selects the signatures of 6.x.
type PassingThroughFragment<RunResult, L> = 0 extends 1 & L ? SQLFragment<RunResult> : [L] extends [never] ? SQLFragment<RunResult> :
  [L] extends [ColumnAggregateFragment<any, infer N>] ? ColumnAggregateFragment<RunResult, N> : SQLFragment<RunResult>;

interface PassingThroughSignatures<M extends SelectResultMode> {
  <T extends Table, C extends ColumnsOption<T>, L extends LateralOption<C, E>, E extends ExtrasOption<T>, A extends string>(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): PassingThroughFragment<FullSelectReturnTypeForTable<T, C, L, E, M>, L>;
}

type ByColumn<Typed, Plain> = TypedByColumn extends true ? Typed : Plain;

type SelectReturnTypeForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  L extends LateralOption<C, E>,
  E extends ExtrasOption<T>,
  M extends SelectResultMode = SelectResultMode.Many,
> =
  (undefined extends L ? ReturningTypeForTable<T, C, E> :
    L extends SQLFragmentMap ? ReturningTypeForTable<T, C, E> & LateralResult<L> :
    L extends SQLFragment<any> ? PassedThroughResult<L, M> :
    never);

export enum SelectResultMode { Many, One, ExactlyOne, Numeric }

export type FullSelectReturnTypeForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  L extends LateralOption<C, E>,
  E extends ExtrasOption<T>,
  M extends SelectResultMode,
> =
  {
    [SelectResultMode.Many]: SelectReturnTypeForTable<T, C, L, E>[];
    [SelectResultMode.ExactlyOne]: SelectReturnTypeForTable<T, C, L, E, SelectResultMode.ExactlyOne>;
    [SelectResultMode.One]: SelectReturnTypeForTable<T, C, L, E, SelectResultMode.One> | undefined;
    [SelectResultMode.Numeric]: number;
  }[M];

export interface SelectSignatures {
  <T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string = never,
    M extends SelectResultMode = SelectResultMode.Many
  >(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
    mode?: M,
    aggregate?: string,
  ): SQLFragment<FullSelectReturnTypeForTable<T, C, L, E, M>>;
}

export class NotExactlyOneError extends Error {
  // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
  query: SQLFragment;
  constructor(query: SQLFragment, ...params: any[]) {
    super(...params);
    if (Error.captureStackTrace) Error.captureStackTrace(this, NotExactlyOneError);  // V8 only
    this.name = 'NotExactlyOneError';
    this.query = query;  // custom property
  }
}

// the aggregate of select() is written raw, so it must be a function name as Postgres lexes it, in up to
// three dotted parts (a `UESCAPE` clause is refused); spaces around it and around the dots are kept as they are
const functionName = new RegExp(`^${space}(?:${identifier})(?:${space}\\.${space}(?:${identifier})){0,2}${space}$`, 'u');

/**
 * Generate a `SELECT` query `SQLFragment`. This can be nested with other 
 * `select`/`selectOne`/`count` queries using the `lateral` option.
 * @param table The table to select from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be selected,
 * or `all`
 * @param options Options object; `null` is none. Keys (all optional) are
 * below; `order` or `lock` set to `null` throws as the query compiles, so
 * `run()` rejects before any query, and so do `columns` and `extras` in
 * `select`, `selectOne` and `selectExactlyOne`, unless one `lateral` subquery
 * takes the columns' place:
 * * `columns` — an array of column names, readonly (`as const`) or not: only
 * these columns will be returned
 * * `order` – an array of `OrderSpec` objects, such as 
 * `{ by: 'column', direction: 'ASC' }`  
 * * `limit` and `offset` – numbers: apply this limit and offset to the query
 * * `lateral` — either an object mapping keys to nested `select`/`selectOne`/
 * `count` queries to be `LATERAL JOIN`ed, or a single `select`/`selectOne`/
 * `count` query whose result will be passed through directly as the result of
 * the containing query; each key is also one identifier in the SQL, any `"`
 * doubled (`{ 'a"b': … }` gives `LEFT JOIN LATERAL (…) AS "lateral_a""b" ON true`);
 * `lateral: null`, or a key whose query is `null` or `undefined`, throws as the
 * query compiles, so `run()` rejects before any query
 * * `alias` — table alias (string): required if using `lateral` to join a table
 * to itself; the alias, or the table name, is also one identifier in the
 * sub-select that `select` wraps the query in, any `"` doubled
 * (`AS "sq_a""b"`)
 * * `extras` — an object mapping key(s) to `SQLFragment`s, so that derived 
 * quantities can be included in the JSON result; a shortcut's query (`count`,
 * `selectOne`…) or its `copy()` is written in parentheses, as a scalar subquery:
 * `jsonb_build_object($1::text, (SELECT count(*) AS result FROM "films"))`
 * @param mode (Used internally by `selectOne` and `count`)
 * @param aggregate (Used internally by `count`, `sum`, `avg`, `min` and `max`)
 * The name of the aggregate function, plain, quoted or `U&` quoted, in up to
 * three dotted parts (`sum`, `my_schema."MyAgg"`, `my_db.my_schema.my_agg`);
 * anything else, a `UESCAPE` clause included, throws. With
 * `columns: ['id']`, `'my_schema."MyAgg"'` gives
 * `SELECT my_schema."MyAgg"("id") AS result FROM "users"`.
 *
 * For its rows one by one, as `cursor()` reads them, the same query without
 * its aggregate: `selectRows()`.
 *
 * With the `topLevelSelectAsRows` config option, read as `select()` is called,
 * `select()` run or compiled on its own, or as the main query of `withCTEs()`,
 * is `selectRows()`'s query, and `run()` gives the same array, one result per
 * row: `SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)`.
 * A single `lateral` passed through is converted above that query,
 * `SELECT to_jsonb(result) AS result FROM (…) AS "sq_films"` (`to_json` with
 * `shortcutsUseJson`), so its value stays JSON, ordered and made distinct by
 * its raw value. Nested (a
 * `lateral`, `extras`, a `sql` template, a CTE), in a `copy()` and in
 * `cursor()`, it keeps its aggregate. The rows form runs with its own
 * `runResultTransform`: one set on the query applies to the aggregate only.
 */
export const select: SelectSignatures = function (
  table: Table,
  where: Whereable | SQLFragment<any> | AllType = all,
  options: SelectOptionsForTable<Table, ColumnsOption<Table>, LateralOption<ColumnsOption<Table>, ExtrasOption<Table>>, ExtrasOption<Table>, any> = {},
  mode: SelectResultMode = SelectResultMode.Many,
  aggregate: string = 'count',
) {
  return selectQuery(table, where, options, mode, aggregate, false);
};

// the body of select(), and of selectRows(), which gives its rows query alone: `rows` is no mode, so that
// SelectResultMode, which is exported, keeps its members
function selectQuery(
  table: Table,
  where: Whereable | SQLFragment<any> | AllType,
  options: SelectOptionsForTable<Table, ColumnsOption<Table>, LateralOption<ColumnsOption<Table>, ExtrasOption<Table>>, ExtrasOption<Table>, any>,
  mode: SelectResultMode,
  aggregate: string,
  rows: boolean,
) {

  // converted to a string once, as raw() converts it (valueOf() first, as in 6.6.1), so that raw() writes the name
  // checked: test() would convert it toString() first, and each compile again, and an object may answer otherwise
  if (mode === SelectResultMode.Numeric) aggregate = '' + aggregate;
  if (mode === SelectResultMode.Numeric && !functionName.test(aggregate)) throw new Error(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);
  // `null` options, from JavaScript, are none, as Zapatos 6.6.1's selectOne(), selectExactlyOne() and writes read them
  options ??= {};

  // `lateral: null`, or a key whose query is null or undefined: Zapatos 6.6.1 threw a TypeError as the query was
  // built (`Object.keys(null)`, `null.copy`); this throws as it compiles, so run() rejects before any query, and so
  // does a copy nested in a lateral, which shares its expressions
  const
    givenLateral: any = callerValue(options, 'lateral'),
    nullKey = givenLateral && !(givenLateral instanceof SQLFragment) ? Object.keys(givenLateral).sort().find(k => givenLateral[k] == null) : undefined,
    lateralRefusal = givenLateral === null ? '`lateral: null` has no meaning: for no lateral join, leave `lateral` out; to join, give it a `select()`, `selectOne()` or `count()` query, or an object of them.' :
      nullKey !== undefined ? `The \`lateral\` key '${nullKey}' is \`${givenLateral[nullKey]}\`, not a query: leave the key out, or give it a \`select()\`, \`selectOne()\` or \`count()\` query.` :
        undefined;
  if (lateralRefusal !== undefined) {
    return sql<SQL, any>`${refusedSQL(lateralRefusal)}`;
  }

  const
    limit1 = mode === SelectResultMode.One || mode === SelectResultMode.ExactlyOne,
    // the copy keeps own enumerable keys only, as in 6.6.1: an option of a prototype is none in selectOne()
    allOptions = limit1 ? { ...options, limit: 1 } : options,
    alias = callerValue(allOptions, 'alias') || table,
    distinct = callerValue(allOptions, 'distinct'), groupBy = callerValue(allOptions, 'groupBy'),
    having = callerValue(allOptions, 'having'), lateral = callerValue(allOptions, 'lateral'),
    columns = callerValue(allOptions, 'columns'), extras = callerValue(allOptions, 'extras'),
    lock = callerValue(allOptions, 'lock') == null || Array.isArray(callerValue(allOptions, 'lock')) ? callerValue(allOptions, 'lock') : [callerValue(allOptions, 'lock')],
    order = callerValue(allOptions, 'order') == null || Array.isArray(callerValue(allOptions, 'order')) ? callerValue(allOptions, 'order') : [callerValue(allOptions, 'order')],
    // shortcutsUseJson (decision 018 § 2), read once per call: the JSON of a row is built with json functions, but
    // under a plain DISTINCT, which compares today's jsonb rows, json having no equality operator (42883)
    json = getConfig().shortcutsUseJson ?? false,
    passthrough = lateral instanceof SQLFragment,
    jsonChild = passthrough && isQuery(lateral) && !!(lateral.runResultTransform as JSONResult)[jsonResult],
    plainDistinct = !!distinct && !(distinct instanceof SQLFragment || typeof distinct === 'string' || Array.isArray(distinct)),
    asJson = json && !plainDistinct && !passthrough && mode !== SelectResultMode.Numeric,
    keyPairs: [string, SQL][] = !asJson || extras == null ? [] : Object.keys(extras).map(k => [k, asScalar(extras[k])]),
    lateralPairs: [string, SQL][] = !asJson ? [] : Object.keys(lateral ?? {}).sort().map(k => [k, sql`${SQLForAlias('lateral_', k)}.result`]),
    // every column beside extras or lateral keys: to_json() of a row level, "row_<alias>", whose output columns a bare
    // name in ORDER BY or DISTINCT ON would match first, so a string there is written after the alias (42702 beside
    // a key of the same name); a fragment is the caller's SQL, written as given
    asRow = asJson && columns === undefined && extras !== null && keyPairs.length + lateralPairs.length > 0,
    qualified = (name: SQL): SQL => asRow && typeof name === 'string' && !name.includes('.') ? sql`${alias}.${name}` : name,
    tableAliasSQL = alias === table ? [] : sql<string>` AS ${alias}`,
    distinctSQL = !distinct ? [] : sql` DISTINCT${distinct instanceof SQLFragment || typeof distinct === 'string' ? sql` ON (${qualified(distinct)})` :
      Array.isArray(distinct) ? sql` ON (${asRow ? mapWithSeparator(distinct, sql`, `, c => qualified(String(c))) : cols(distinct)})` : []}`,
    colsSQL = passthrough ? [] :
      mode === SelectResultMode.Numeric ?
        (columns ? sql`${raw(aggregate)}(${cols(columns)})` : sql`${raw(aggregate)}(*)`) :
        !asJson ? SQLForColumnsOfTable(columns, alias as Table, columnsNull) :
          columns === null ? refusedSQL(columnsNull) :
          extras === null ? refusedSQL(extrasNull) :
          columns === undefined ? sql`to_json(${asRow ? SQLForAlias('row_', alias) : alias}.*)` :
          SQLForJSONObject([...columns.map((c): [string, SQL] => [c, c]), ...keyPairs, ...lateralPairs]),
    colsExtraSQL = passthrough || mode === SelectResultMode.Numeric || asJson ? [] : SQLForExtras(extras),
    colsLateralSQL = lateral === undefined || mode === SelectResultMode.Numeric || asJson ? [] :
      passthrough ? (plainDistinct && jsonChild ? sql`to_jsonb("lateral_passthru".result)` : sql`"lateral_passthru".result`) :
        sql` || jsonb_build_object(${mapWithSeparator(
          Object.keys(lateral).sort(), sql`, `, k => sql`${param(k)}::text, ${SQLForAlias('lateral_', k)}.result`)})`,
    allColsSQL = sql`${colsSQL}${colsExtraSQL}${colsLateralSQL}`,
    whereSQL = where === all ? [] : sql` WHERE ${where}`,
    groupBySQL = !groupBy ? [] : sql` GROUP BY ${groupBy instanceof SQLFragment || typeof groupBy === 'string' ? groupBy : cols(groupBy)}`,
    havingSQL = !having ? [] : sql` HAVING ${having}`,
    orderSQL = order === undefined ? [] :
      order === null ? refusedSQL(orderNull) :
      sql` ORDER BY ${mapWithSeparator(order as OrderSpecForTable<Table>[], sql`, `, o => {  // `as` clause is required when TS not strict
        // each key is read once, and checked before the next is read: a getter may answer anew, so raw() and the
        // message get the read that was checked
        const direction = callerValue(o, 'direction')!;
        if (!['ASC', 'DESC'].includes(direction)) throw new Error(`Direction must be ASC/DESC, not '${direction}'`);
        const nulls = callerValue(o, 'nulls');
        if (nulls && !['FIRST', 'LAST'].includes(nulls)) throw new Error(`Nulls must be FIRST/LAST/undefined, not '${nulls}'`);
        return sql`${qualified(callerValue(o, 'by')!)} ${raw(direction)}${nulls ? sql` NULLS ${raw(nulls)}` : []}`;
      })}`,
    limitSQL = (limit: number | undefined) => limit === undefined ? [] :
      callerValue(allOptions, 'withTies') ? sql` FETCH FIRST ${param(limit)} ROWS WITH TIES` :
        sql` LIMIT ${param(limit)}`,  // compatibility with pg pre-10.5; and fewer bytes!
    offsetSQL = callerValue(allOptions, 'offset') === undefined ? [] : sql` OFFSET ${param(callerValue(allOptions, 'offset'))}`,  // pg is lax about OFFSET following FETCH, and we exploit that
    lockSQL = lock === undefined ? [] : lock === null ? refusedSQL(lockNull) : (lock as SelectLockingOptions<string>[]).map(lock => {  // `as` clause is required when TS not strict
      const strength = callerValue(lock, 'for')!;  // for and wait read once each, as an order item's keys
      if (!['UPDATE', 'NO KEY UPDATE', 'SHARE', 'KEY SHARE'].includes(strength)) throw new Error(`Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '${strength}'`);
      const wait = callerValue(lock, 'wait');
      if (wait && !['NOWAIT', 'SKIP LOCKED'].includes(wait)) throw new Error(`Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '${wait}'`);
      const
        ofTables = callerValue(lock, 'of') === undefined || Array.isArray(callerValue(lock, 'of')) ? callerValue(lock, 'of') : [callerValue(lock, 'of')],
        ofClause = ofTables === undefined ? [] : sql` OF ${mapWithSeparator(ofTables as Table[], sql`, `, t => t)}`;  // `as` clause is required when TS not strict
      return sql` FOR ${raw(strength)}${ofClause}${wait ? sql` ${raw(wait)}` : []}`;
    }),
    lateralSQL = lateral === undefined ? [] :
      lateral instanceof SQLFragment ? (() => {
        return sql` LEFT JOIN LATERAL (${lateral.copy({ parentTable: alias })}) AS "lateral_passthru" ON true`;
      })() :
        Object.keys(lateral).sort().map(k => {
          /// enables `parent('column')` in subquery's Whereables
          const subQ = lateral[k].copy({ parentTable: alias });
          return sql` LEFT JOIN LATERAL (${subQ}) AS ${SQLForAlias('lateral_', k)} ON true`;
        });

  const
    limit = callerValue(allOptions, 'limit'),
    fromSQL = (limit: number | undefined) => sql` FROM ${table}${tableAliasSQL}${lateralSQL}${whereSQL}${groupBySQL}${havingSQL}${orderSQL}${limitSQL(limit)}${offsetSQL}${lockSQL}`,
    keysAsSQL = asRow ? [...keyPairs, ...lateralPairs].map(([k, v]) => sql`, ${v} AS ${SQLForKeyAlias(k)}`) : [],
    rowsSQL = (limit: number | undefined) => asRow ?
      sql<SQL, any>`SELECT ${allColsSQL} AS result FROM (SELECT${distinctSQL} ${alias}.*${keysAsSQL}${fromSQL(limit)}) AS ${SQLForAlias('row_', alias)}` :
      sql<SQL, any>`SELECT${distinctSQL} ${allColsSQL} AS result${fromSQL(limit)}`,
    rowsQuery = rowsSQL(limit),
    query = mode !== SelectResultMode.Many || rows ? rowsQuery :
      // we need the aggregate to sit in a sub-SELECT in order to keep ORDER and LIMIT working as usual
      json ? sql<SQL, any>`SELECT coalesce(json_agg(result), '[]') AS result FROM (${rowsQuery}) AS ${SQLForAlias('sq_', alias)}` :
        sql<SQL, any>`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (${rowsQuery}) AS ${SQLForAlias('sq_', alias)}`,
    checksSecondRow = mode === SelectResultMode.ExactlyOne && (getConfig().selectExactlyOneChecksForSecondRow ?? false),
    asRows = mode === SelectResultMode.Many && !rows && (getConfig().topLevelSelectAsRows ?? false);

  if (checksSecondRow || asRows) {
    // compiled on its own, as `run()` does, the query asks for a second row, or is selectRows()'s; a parent query
    // compiles it into its own `result` (`sql`) or compiles a copy (`lateral`), so nested it keeps `LIMIT 1`, where a
    // second row would duplicate the parent row, or its aggregate, which the parent reads as one value; the top-level
    // form takes the properties a caller may have set on the query since (those `copy()` carries over), so it is a
    // fragment of its own, never the one nested in the aggregate, which would carry the name and noop nested
    const
      topLevelQuery = checksSecondRow ? rowsSQL(2) :
        // a single lateral passed through keeps its JSON value, as jsonb_agg() or json_agg() converts it (pg parses the
        // bare column, a count() as a string, a date as a Date), converted above the same rows query, so that ORDER BY
        // and DISTINCT still act on the raw value; to_json() with shortcutsUseJson keeps a json child's key order
        lateral instanceof SQLFragment ?
          sql<SQL, any>`SELECT ${raw(json ? 'to_json' : 'to_jsonb')}(result) AS result FROM (${rowsQuery}) AS ${SQLForAlias('sq_', alias)}` :
          rowsSQL(limit),
      nestedCompile = query.compile,
      topLevel = () => Object.assign(topLevelQuery,
        { parentTable: query.parentTable, preparedName: query.preparedName, noop: query.noop, noopResult: query.noopResult });
    (query as TopLevelFormed)[topLevelForm] = topLevelQuery;
    query.compile = (result, parentTable, currentColumn) =>
      result ? nestedCompile(result, parentTable, currentColumn) : topLevel().compile(undefined, parentTable, currentColumn);
    if (asRows) {
      // run() too: a copy, which compiles as nested, keeps the query's own runResultTransform, the aggregate's
      topLevelQuery.runResultTransform = rowsResult;
      query.run = (queryable, force) => topLevel().run(queryable, force);
    }
  }

  query.runResultTransform =

    // selectRows(): one result per row, as insert() of an array gives its rows; a transform of its own, which
    // jsonResult marks, never the shared rowsResult
    rows ? (qr) => rowsResult(qr) :

    mode === SelectResultMode.Numeric ?
      // note: pg deliberately returns strings for int8 in case 64-bit numbers overflow
      // (see https://github.com/brianc/node-pg-types#use), but we assume our counts aren't that big;
      // no row (a groupBy with no group, a having, offset, limit: 0) reads as a NULL result, so 0
      (qr) => Number(qr.rows[0]?.result ?? null) :

      mode === SelectResultMode.ExactlyOne ?
        (qr) => {
          const result = qr.rows[0]?.result;
          if (result === undefined) throw new NotExactlyOneError(query, 'One result expected but none returned (hint: check `.query.compile()` on this Error)');
          if (checksSecondRow && qr.rows.length > 1) throw new NotExactlyOneError(query, 'One result expected but more returned (hint: check `.query.compile()` on this Error)');
          return result;
        } :
        // SelectResultMode.One or SelectResultMode.Many
        (qr) => qr.rows[0]?.result;

  // select()'s json_agg, a row built with json functions, or a passed-through json result kept as it is
  (query.runResultTransform as JSONResult)[jsonResult] = mode !== SelectResultMode.Numeric &&
    (mode === SelectResultMode.Many && !rows ? json : asJson || (jsonChild && !plainDistinct));
  query['parenthesisedInExtras'] = true;
  return query;
}


/* === selectRows === */

declare const rowsQuery: unique symbol;

/**
 * The second type argument of the `SQLFragment` that `selectRows()` returns: a
 * query of many rows, which `lateral`, `extras` and a `where` refuse, as they
 * take `SQLFragment<any>`, and a `sql` template, `withCTEs()` and `cursor()`
 * take, as `SQLFragment<any, any>`.
 */
export interface RowsQuery { readonly [rowsQuery]: true }

// a single lateral passed through comes row by row as pg parses its column: a bigint or a numeric as a string, a date
// as a Date. count(), sum(), avg(), and min() or max() unless typed by column, are typed number, as their own run()
// gives them, through Number(), or nested, as JSON (#749): refused, with any fragment typed number, which the type
// cannot tell from them. Nested under a lateral key, the value is JSON, and its type holds. Each member of a union
// is checked (cond ? count() : select()), and `true extends`, as TS 4.1 resolves `[…] extends [never]` wrongly here
type RowsNumberMember<L> = L extends ColumnAggregateFragment<any, any> ? never :
  L extends SQLFragment<infer R, any> ?
    (0 extends 1 & R ? never : [Exclude<R, null | undefined>] extends [never] ? never :
      [Exclude<R, null | undefined>] extends [number] ? true : never) :
  never;
type RowsLateralOption<L> = 0 extends 1 & L ? unknown : true extends RowsNumberMember<L> ? { lateral?: never } : unknown;

export interface SelectRowsSignatures {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string = never,
  >(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A> & RowsLateralOption<L>,
  ): SQLFragment<SelectReturnTypeForTable<T, C, L, E, SelectResultMode.One>[], RowsQuery>;
}

/**
 * Generate the query `select()` wraps in its aggregate, as a `SQLFragment` of
 * its own, one row per result: for `cursor()`, which runs exactly the
 * fragment it is given, and so reads a `select()` as its one aggregate row.
 * With `{ columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }`:
 * `SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" ORDER BY "title" ASC`,
 * where `select()` sends
 * `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (…the same…) AS "sq_films"`.
 *
 * `run()` gives what `select()` gives, `[]` for no row, but for a single
 * `lateral` subquery, whose result is passed through as `selectOne()` passes
 * it, as `pg` parses its column, and typed so. One typed `number`, alone or in
 * a union, does not compile: `count()`, `sum()`, `avg()`, and `min()` or
 * `max()` unless typed by column (`aggregatesTypedByColumn`), since `pg` gives
 * a `bigint` or a `numeric` as a string and a `date` as a `Date` (#749).
 * Under a `lateral` key it is JSON, as in `select()`; past the type, from
 * JavaScript, `pg`'s value.
 * A `lateral` whose type is a type parameter, or a fragment typed by an
 * unconstrained one, does not compile either: a function that forwards one
 * calls `select()`, or casts.
 *
 * A query of many rows, it is typed so that a `lateral`, an `extras` value, a
 * `where` and the `Whereable` value of a typed column refuse it; a `sql`
 * template, `withCTEs()` and `cursor()` take it.
 * @param table The table to select from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be selected,
 * or `all`
 * @param options Options object. See documentation for `select` for details.
 */
export const selectRows: SelectRowsSignatures = function (
  table: Table,
  where: Whereable | SQLFragment<any> | AllType = all,
  options: SelectOptionsForTable<Table, ColumnsOption<Table>, LateralOption<ColumnsOption<Table>, ExtrasOption<Table>>, ExtrasOption<Table>, any> = {},
) {
  return selectQuery(table, where, options, SelectResultMode.Many, 'count', true);
};


/* === selectOne === */

export interface SelectOneSignatures extends ByColumn<PassingThroughSignatures<SelectResultMode.One>, {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string,
  >(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<FullSelectReturnTypeForTable<T, C, L, E, SelectResultMode.One>>;
}> { }

/**
 * Generate a `SELECT` query `SQLFragment` that returns only a single result (or 
 * undefined). A `LIMIT 1` clause is added automatically. This can be nested with 
 * other `select`/`selectOne`/`count` queries using the `lateral` option.
 *
 * With `withTies`, it is `FETCH FIRST $n ROWS WITH TIES`, `$n` being `1`, which
 * Postgres refuses without `order` (42601):
 * `run()` gives one of the tied rows, and in a `lateral` under an outer
 * `select()` the parent row comes back once per tie (a nested `select()` keeps
 * the ties in its array).
 * @param table The table to select from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be selected,
 * or `all`
 * @param options Options object. See documentation for `select` for details.
 */
export const selectOne: SelectOneSignatures = function (table, where, options = {}) {
  // you might argue that 'selectOne' offers little that you can't get with 
  // destructuring assignment and plain 'select' 
  // -- e.g.let[x] = async select(...).run(pool); -- but something worth having
  // is '| undefined' in the return signature, because the result of indexing 
  // never includes undefined (until 4.1 and --noUncheckedIndexedAccess)
  // (see https://github.com/Microsoft/TypeScript/issues/13778)

  return select(table, where, options, SelectResultMode.One);
} as SelectOneSignatures;


/* === selectExactlyOne === */

export interface SelectExactlyOneSignatures extends ByColumn<PassingThroughSignatures<SelectResultMode.ExactlyOne>, {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string,
  >(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<FullSelectReturnTypeForTable<T, C, L, E, SelectResultMode.ExactlyOne>>;
}> { }

/**
 * Generate a `SELECT` query `SQLFragment` that returns a single result or 
 * throws an error. A `LIMIT 1` clause is added automatically, so it checks for
 * at least one row, not exactly one. This can be nested with other
 * `select`/`selectOne`/`count` queries using the `lateral` option.
 *
 * With the `selectExactlyOneChecksForSecondRow` config option, the query run
 * (or compiled) on its own asks for `LIMIT 2` and also throws on a second row:
 * `SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("id" = $1) LIMIT $2`,
 * `$2` being `2`. Nested in another query (a `lateral`, a `sql` template), or
 * compiled into a `result` of its own, it keeps `LIMIT 1`.
 *
 * With `withTies`, each `LIMIT` is `FETCH FIRST … ROWS WITH TIES`,
 * as in `selectOne()`: nested in a `lateral` under an outer `select()`, the
 * parent row comes back once per tie, option or not.
 * @param table The table to select from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be selected,
 * or `all`
 * @param options Options object. See documentation for `select` for details.
 */

export const selectExactlyOne: SelectExactlyOneSignatures = function (table, where, options = {}) {
  return select(table, where, options, SelectResultMode.ExactlyOne);
} as SelectExactlyOneSignatures;


/* === count, sum, avg === */

export interface NumericAggregateSignatures {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string,
  >(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<number>;
}

// Only literal false selects the legacy signatures. Exclude any, then check assignability both ways.
type TypedByColumn = ConfigTypes extends { aggregatesTypedByColumn: infer Setting } ?
  true extends Setting ? true : [Setting, false] extends [false, Setting] ? false : true :
  true;
type ColumnValueOrNull<S, C> = C extends readonly (keyof S)[] ? S[C[number]] | null : never;

export interface NullableNumericAggregateSignatures {
  <T extends Table, C extends ColumnsOption<T>, L extends LateralOption<C, E>, E extends ExtrasOption<T>, A extends string>(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<number | null>;
}

export interface ColumnAggregateSignatures {
  <T extends Table, C extends ColumnsOption<T>, L extends LateralOption<C, E>, E extends ExtrasOption<T>, A extends string>(
    table: T,
    where: WhereableArg<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): ColumnAggregateFragment<ColumnValueOrNull<SelectableForTable<T>, C>, ColumnValueOrNull<JSONSelectableForTable<T>, C>>;
}

// the aggregate takes one column, none for count(*), and has no row to pass a lateral query through: Zapatos 6.6.1
// sent `sum(*)`, `count("a", "b")` or `SELECT  AS result`, which Postgres refuses. The type is 6.6.1's, so these
// throw as the query compiles, as a value with no meaning does in core.ts: `run()` rejects, before any query.
// A string or another primitive as `columns` is refused here, before cols() refuses it in terms of db.cols()
const numericAggregate = (
  table: Table,
  where: Whereable | SQLFragment<any> | AllType,
  options: SelectOptionsForTable<Table, ColumnsOption<Table>, LateralOption<ColumnsOption<Table>, ExtrasOption<Table>>, ExtrasOption<Table>, any> = {},
  aggregate: string,
): SQLFragment<number> => {
  const
    query = select(table, where, options, SelectResultMode.Numeric, aggregate),
    columns = callerValue(options, 'columns'), lateral = callerValue(options, 'lateral'),  // `null` options are none, as in select()
    columnsRefusal =
      !columns ? (aggregate === 'count' ? undefined : `${aggregate}() needs one column to aggregate: pass columns: ['column']`) :
        typeof columns !== 'object' && typeof columns !== 'function' ? `${aggregate}() takes columns as an array, not ${typeof columns}: pass columns: ['column']${aggregate === 'count' ? ' (leave columns out for count(*))' : ''}` :
          Array.isArray(columns) && columns.length !== 1 ? `${aggregate}() takes one column in columns, not ${columns.length}${aggregate === 'count' ? ' (leave columns out for count(*))' : ''}` :
            undefined,
    refusal = columnsRefusal ?? (lateral instanceof SQLFragment ? `${aggregate}() cannot pass a lateral query through: nest it in the lateral of a select() instead` : undefined),
    byColumn = aggregate === 'min' || aggregate === 'max';

  if (refusal === undefined) {
    // Number() makes a NULL 0, a date its epoch ms, a text NaN, and an int8 or numeric string a number;
    // the option changes no SQL, so it is read at run(), as the type, declared once for the program, says
    if (aggregate !== 'count') {
      query.runResultTransform = (qr) => {
        const result = qr.rows[0]?.result ?? null;  // no row reads as a NULL result, as for count()
        if (getConfig().aggregatesTypedByColumn ?? true) return byColumn || result === null ? result : Number(result);
        return Number(result);
      };
    }
    return query;
  }
  // the refusal sits in the expressions, which copy() shares, so that a copy nested in a lateral throws too
  return sql<SQL, number>`${refusedSQL(refusal)}`;
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a count. This can be 
 * nested in other `select`/`selectOne` queries using their `lateral` option.
 * Passed through by the `selectOne`/`selectExactlyOne` that is run (not under a
 * key or a `select`), it is the column as `pg` reads a `bigint`, a string
 * (`'3'`), though the type says `number`: `Number()` that string, or nest it
 * under a key.
 * @param table The table to count from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be counted, 
 * or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 * `columns: ['col']` gives `count("col")`, and no `columns` `count(*)`;
 * several columns, a string in place of the array, or a single query as
 * `lateral`, throw as the query compiles, so `run()` rejects before any query
 * is sent. A query that returns no row (a `groupBy` with no group, a `having`
 * that keeps none, `offset: 1`, `limit: 0`) gives `0` from `run()`, but `null`
 * nested in a `lateral` or `extras`, though the type says `number`.
 */
export const count: NumericAggregateSignatures = function (table, where, options?) {
  return numericAggregate(table, where, options, 'count');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a sum. This can be 
 * nested in other `select`/`selectOne` queries using their `lateral` option.
 * Passed through as for `count`, the sum of an integer or `numeric` column is
 * a string, and `null` with no row to sum.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 * `columns` holds the one column to aggregate: `columns: ['col']` gives
 * `sum("col")`; no column, several, a string in place of the array, or a
 * single query as `lateral`, throw as the query compiles, so `run()` rejects
 * before any query is sent.
 * An empty set or a query returning no row gives `null`, or `0` with `aggregatesTypedByColumn: false`
 * in `setConfig()`. Only a literal `false` in `ConfigTypes` selects the legacy `number` signature.
 */
export const sum: TypedByColumn extends true ? NullableNumericAggregateSignatures : NumericAggregateSignatures = function (table, where, options?) {
  return numericAggregate(table, where, options, 'sum');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns an arithmetic mean via
 * the `avg` aggregate function. This can be nested in other `select`/
 * `selectOne` queries using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 * `columns` holds the one column to aggregate, and an empty set gives `null` or
 * the legacy `0`, as for `sum`; passed through, as for `sum`.
 */
export const avg: TypedByColumn extends true ? NullableNumericAggregateSignatures : NumericAggregateSignatures = function (table, where, options?) {
  return numericAggregate(table, where, options, 'avg');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a minimum via the `min`
 * aggregate function. This can be nested in other `select`/`selectOne` queries
 * using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be 
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 * `columns` holds the one column to aggregate, as for `sum`. The result is
 * the column's value as `pg` parses it, nested as JSON, or `null`. With
 * `aggregatesTypedByColumn: false`, `.run()` passes it through `Number()`.
 */
export const min: TypedByColumn extends true ? ColumnAggregateSignatures : NumericAggregateSignatures = function (table, where, options?) {
  return numericAggregate(table, where, options, 'min');
} as ColumnAggregateSignatures;

/**
 * Generate a `SELECT` query `SQLFragment` that returns a maximum via the `max`
 * aggregate function. This can be nested in other `select`/`selectOne` queries
 * using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 * `columns` holds the one column to aggregate, and the result is typed, as
 * for `min`.
 */
export const max: TypedByColumn extends true ? ColumnAggregateSignatures : NumericAggregateSignatures = function (table, where, options?) {
  return numericAggregate(table, where, options, 'max');
} as ColumnAggregateSignatures;



/* === withCTEs === */

// a prepared fragment writes its name into whatever compiles it, so one name would cover two texts, the fragment
// alone and with the WITH, which pg refuses ("Prepared statements must be unique"): nested, an unprepared copy,
// made at the call, so that a prepared() on the fragment afterwards stays its own. A no-op (an insert() or upsert()
// of no row) is a query of no row, from no table: its own text, which runs if forced, is refused on a GENERATED
// ALWAYS column and on a view (428C9)
const inWith = <F>(fragment: F, json: boolean) =>
  !(fragment instanceof SQLFragment) ? fragment :
    fragment.noop ? (json ? sql`SELECT NULL::json AS result WHERE false` : sql`SELECT NULL::jsonb AS result WHERE false`) :
      Object.assign(fragment.copy(), { preparedName: undefined });

/**
 * Put CTEs before a query, keeping its result:
 * `WITH "recent" AS (…), "rich" AS (…) <query>`, the CTEs in the object's
 * order (as `Object.keys` gives it: an integer key comes first), so that each
 * may read those before it. With no CTE, a copy of `query`, its own SQL, so a
 * list built at run time needs no branch. Each key is one name, as a
 * `lateral` key is: its `"` doubled, but a `""` escaped by hand kept as written
 * (`a""b` and `a"b` both give `"a""b"`), never split on `.`.
 *
 * The result is a copy of `query`: it resolves to what `query` does, and is
 * written in parentheses as an `extras` or `insert()` value where `query` is.
 * A no-op `query` or CTE (an `insert()` or `upsert()` of no row) is written
 * `SELECT NULL::jsonb AS result WHERE false` (`NULL::json` with
 * `shortcutsUseJson`), and the result is no no-op, so
 * the CTEs run. A `selectExactlyOne()` that checks for a second row still does
 * at the top level, and a `select()` with `topLevelSelectAsRows` is still its
 * rows query there, a CTE keeping its aggregate. The result is never
 * prepared, whatever `query` is, even by a `prepared()` called on `query` or a
 * CTE afterwards: call `prepared()` on it.
 * @param ctes The CTEs, keyed by name: a shortcut or a `sql` fragment each
 * @param query The main query
 */
export const withCTEs = <Q extends SQLFragment<any, any>>(ctes: { [name: string]: SQLFragment<any, any> }, query: Q): Q => {
  const
    entries = Object.entries(ctes),
    json = getConfig().shortcutsUseJson ?? false,  // read at the call, as the shortcuts read it
    withClause = (main: SQLFragment<any, any>) =>
      sql`WITH ${mapWithSeparator(entries, sql`, `, ([name, cte]) => sql`${SQLForAlias('', name)} AS (${inWith(cte, json)})`)} ${inWith(main, json)}`,
    result = Object.assign(entries.length === 0 ? query.copy() as Q :
      query.copy({ literals: ['', ''], expressions: [withClause(query)], noop: false }) as Q, { preparedName: undefined }),
    topLevelQuery = (query as TopLevelFormed)[topLevelForm];

  if (topLevelQuery) {
    // compiled on its own, the LIMIT 2 form or the rows form, as select() compiles it; nested, LIMIT 1 or the aggregate
    const
      nestedCompile = result.compile,
      topLevel = () => Object.assign(entries.length === 0 ? topLevelQuery.copy() : withClause(topLevelQuery), { parentTable: result.parentTable, preparedName: result.preparedName });
    result.compile = (compiled, parentTable, currentColumn) => compiled ? nestedCompile(compiled, parentTable, currentColumn) :
      topLevel().compile(undefined, parentTable, currentColumn);
    // the rows form runs with its own result, one per row, as select() runs it
    if (topLevelQuery.runResultTransform === rowsResult) {
      result.run = (queryable, force) =>
        Object.assign(topLevel(), { runResultTransform: rowsResult, noop: result.noop, noopResult: result.noopResult }).run(queryable, force);
    }
  }
  return result;
};
