/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import type {
  JSONSelectableForTable,
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
  Parameter,
  DangerousRawString,
  ColumnNames,
  ColumnValues,
  ParentColumn,
} from './core';

import {
  completeKeysWithDefaultValue,
  identifier,
  mapWithSeparator,
  NoInfer,
  space,
  warnOnce,
} from './utils';

import { getConfig } from './config';


export type JSONOnlyColsForTable<T extends Table, C extends any[] /* `ColumnForTable<T>[]` gives errors here for reasons I haven't got to the bottom of */> =
  Pick<JSONSelectableForTable<T>, C[number]>;

export interface SQLFragmentMap { [k: string]: SQLFragment<any> }
export interface SQLFragmentOrColumnMap<T extends Table> { [k: string]: SQLFragment<any> | ColumnForTable<T> }
export type RunResultForSQLFragment<T extends SQLFragment<any, any>> = T extends SQLFragment<infer RunResult, any> ?
  (undefined extends RunResult ? NonNullable<RunResult> | null : RunResult) :
  never;

export type LateralResult<L extends SQLFragmentMap> = { [K in keyof L]: RunResultForSQLFragment<L[K]> };
export type ExtrasResult<T extends Table, E extends SQLFragmentOrColumnMap<T>> = { [K in keyof E]:
  E[K] extends SQLFragment<any> ? RunResultForSQLFragment<E[K]> : E[K] extends keyof JSONSelectableForTable<T> ? JSONSelectableForTable<T>[E[K]] : never;
};

export type ExtrasOption<T extends Table> = SQLFragmentOrColumnMap<T> | undefined;
export type ColumnsOption<T extends Table> = readonly ColumnForTable<T>[] | undefined;

type LimitedLateralOption = SQLFragmentMap | undefined;
type FullLateralOption = LimitedLateralOption | SQLFragment<any>;
export type LateralOption<
  C extends ColumnsOption<Table>,
  E extends ExtrasOption<Table>,
> =
  undefined extends C ? undefined extends E ? FullLateralOption : LimitedLateralOption : LimitedLateralOption;

export interface ReturningOptionsForTable<T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>> {
  returning?: C;
  extras?: E;
};

type ReturningTypeForTable<T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>> =
  (undefined extends C ? JSONSelectableForTable<T> :
    C extends ColumnForTable<T>[] ? JSONOnlyColsForTable<T, C> :
    never) &
  (undefined extends E ? {} :
    E extends SQLFragmentOrColumnMap<T> ? ExtrasResult<T, E> :
    never);


function SQLForColumnsOfTable(columns: readonly Column[] | undefined, table: Table) {
  return columns === undefined ? sql`to_jsonb(${table}.*)` :
    sql`jsonb_build_object(${mapWithSeparator(columns, sql`, `, c => sql`${param(c)}::text, ${c}`)})`;
}

// one double-quoted identifier, as Postgres lexes it: `"a"`, `"a""b"` (core.ts also allows dotted ones)
const quotedIdentifier = /^"(?:[^"\0]|"")+"$/;

// an alias of our own (`"lateral_<key>"`, `"sq_<alias>"`) is one identifier, not split on `.`; a `"` is
// doubled as quote_ident does, so it cannot close its quotes, unless the alias already compiled to one
// quoted identifier (`a""b`), which is written as before
function SQLForAlias(prefix: string, name: string) {
  const quoted = `"${prefix}${name}"`;
  return raw(quotedIdentifier.test(quoted) ? quoted : `"${prefix}${name.replace(/"/g, '""')}"`);
}

function SQLForExtras<T extends Table>(extras: ExtrasOption<T>) {
  return extras === undefined ? [] :
    sql` || jsonb_build_object(${mapWithSeparator(
      Object.keys(extras), sql`, `, k => sql`${param(k)}::text, ${extras[k]}`)})`;
}


// an undefined value is sent as NULL, as in 6.6.1, but warns once; with undefinedMeansMissing (the default in 7.0)
// it is a missing key instead, as JSON.stringify leaves it out: `toDefault` sends DEFAULT (insert), otherwise the
// key goes (update, upsert, whose missing keys then take DEFAULT, and the rules of upsertRequiresSameKeys);
// a null row, which an untyped caller may pass among others, is read as `{}`, as completeKeysWithDefaultValue reads it
function undefinedAsMissing<V extends object>(values: V, toDefault: boolean): V {
  const rows: object[] = (Array.isArray(values) ? values : [values]).map(row => row ?? {});
  if (!rows.some(row => Object.values(row).includes(undefined))) return values;
  if (!(getConfig().undefinedMeansMissing ?? false)) {
    warnOnce('PGCAST_DEP002', 'An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.');
    return values;
  }
  const kept = rows.map(row => Object.fromEntries(Object.entries(row).flatMap(([k, v]) =>
    v !== undefined ? [[k, v]] : toDefault ? [[k, Default]] : [])));
  return (Array.isArray(values) ? kept : kept[0]) as V;
}


/* === insert === */

interface InsertSignatures {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: InsertableForTable<T>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>>;

  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: InsertableForTable<T>[],
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
}

/**
 * Generate an `INSERT` query `SQLFragment`.
 * @param table The table into which to insert
 * @param values The `Insertable` values (or array thereof) to be inserted.
 * An `undefined` value is sent as `NULL`, and emits a `DeprecationWarning`
 * (`PGCAST_DEP002`), once; with the `undefinedMeansMissing` config option (the
 * default in 7.0), it sends `DEFAULT`, as a key missing from one of several
 * rows does: `{ title: undefined }` gives `VALUES (DEFAULT)`.
 */
export const insert: InsertSignatures = function (
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
      completedValues = Array.isArray(values) ? completeKeysWithDefaultValue(values, Default) : values,
      colsSQL = cols(Array.isArray(completedValues) ? completedValues[0] : completedValues),
      valuesSQL = Array.isArray(completedValues) ?
        mapWithSeparator(completedValues as Insertable[], sql`, `, v => sql`(${vals(v)})`) :
        sql`(${vals(completedValues)})`,
      returningSQL = SQLForColumnsOfTable(options?.returning, table),
      extrasSQL = SQLForExtras(options?.extras);

    query = sql`INSERT INTO ${table} (${colsSQL}) VALUES ${valuesSQL} RETURNING ${returningSQL}${extrasSQL} AS result`;
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
 */
export function constraint<T extends Table>(x: UniqueIndexForTable<T>) { return new Constraint<T>(x); }

export interface UpsertAction { $action: 'INSERT' | 'UPDATE' }

type UpsertReportAction = 'suppress';
type UpsertReturnableForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  E extends ExtrasOption<T>,
  RA extends UpsertReportAction | undefined
> =
  ReturningTypeForTable<T, C, E> & (undefined extends RA ? UpsertAction : {});

type UpsertConflictTargetForTable<T extends Table> = Constraint<T> | ColumnForTable<T> | ColumnForTable<T>[];
type UpdateColumns<T extends Table> = ColumnForTable<T> | ColumnForTable<T>[];

interface UpsertOptions<
  T extends Table,
  C extends ColumnsOption<T>,
  E extends ExtrasOption<T>,
  UC extends UpdateColumns<T> | undefined,
  RA extends UpsertReportAction | undefined,
> extends ReturningOptionsForTable<T, C, E> {
  updateValues?: UpdatableForTable<T>;
  updateColumns?: UC;
  noNullUpdateColumns?: ColumnForTable<T> | ColumnForTable<T>[] | typeof all;
  reportAction?: RA;
}

interface UpsertSignatures {
  <T extends Table,
    C extends ColumnsOption<T>,
    E extends ExtrasOption<T>,
    UC extends UpdateColumns<T> | undefined,
    RA extends UpsertReportAction | undefined
  >(
    table: T,
    values: InsertableForTable<T>,
    conflictTarget: UpsertConflictTargetForTable<T>,
    options?: UpsertOptions<T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnableForTable<T, C, E, RA> | (UC extends never[] ? undefined : never)>;

  <T extends Table,
    C extends ColumnsOption<T>,
    E extends ExtrasOption<T>,
    UC extends UpdateColumns<T> | undefined,
    RA extends UpsertReportAction | undefined
  >(
    table: T,
    values: InsertableForTable<T>[],
    conflictTarget: UpsertConflictTargetForTable<T>,
    options?: UpsertOptions<T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnableForTable<T, C, E, RA>[]>;
}

export const doNothing = [];

// a plain value is sent as a parameter, as `vals()` sends it; a value that holds one of our own objects
// (`sql`, `param`, `raw`, `cols`, `vals`, `parent`, a symbol such as `Default` or `self`) anywhere in its
// arrays and plain objects is compiled as it always was, as in a `sql` template; so is a function or the
// global object where a `sql` template throws on it, alone or as an array item, but not as the value of
// an object's key, which a `sql` template sends as a parameter (a `toPostgres()` method, say)
const compiledAsIs = (value: any, inObject = false): boolean =>
  typeof value === 'function' || value === globalThis ? !inObject :
    value instanceof SQLFragment || value instanceof Parameter || value instanceof DangerousRawString ||
    value instanceof ColumnNames || value instanceof ColumnValues || value instanceof ParentColumn ||
    typeof value === 'symbol' ||
    (Array.isArray(value) ? value.some(item => compiledAsIs(item, inObject)) :
      typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      Object.values(value).some(item => compiledAsIs(item, true)));

const updateValueSQL = (value: any) => compiledAsIs(value) ? value : param(value);

/**
 * Generate an 'upsert' (`INSERT ... ON CONFLICT ...`) query `SQLFragment`.
 * @param table The table to update or insert into
 * @param values An `Insertable` of values (or an array thereof) to be inserted 
 * or updated
 * @param conflictTarget A `UNIQUE`-indexed column (or array thereof) or a 
 * `UNIQUE` index (wrapped in `db.constraint(...)`) that determines whether we
 * get an `UPDATE` (when there's a matching existing value) or an `INSERT`
 * (when there isn't)
 * @param options Optionally, an object with any of the keys `updateColumns`,
 * `noNullUpdateColumns` and `updateValues` (see documentation). A plain value
 * in `updateValues` is sent as a parameter: `{ mood: 'happy' }` gives
 * `ROW(..., $n)`. To read a column there, use a fragment, which is written as
 * it is: ``{ name: db.sql`${'users.name'}` }`` gives `ROW(..., "users"."name")`.
 *
 * Without `updateColumns`, rows with different keys can lose data: a key
 * missing from one row is inserted as `DEFAULT`, then overwrites that row's
 * existing value on conflict. When such a key is still set from `EXCLUDED`
 * (it is not a key of `updateValues`, nor a column of an array or string
 * `conflictTarget`), this emits a `DeprecationWarning` (`PGCAST_DEP001`),
 * once. With the `upsertRequiresSameKeys` config option (the default in 7.0),
 * it throws instead, before any query: pass `updateColumns`, or give every row
 * the same keys. So new rows without their serial `id`, upserted on `'id'`
 * among existing ones, neither warn nor throw.
 *
 * An `undefined` value in `values` is sent as `NULL`, then set from `EXCLUDED`,
 * and emits a `DeprecationWarning` (`PGCAST_DEP002`), once. With the
 * `undefinedMeansMissing` config option (the default in 7.0), its key is left
 * out, as if it were missing: one row neither inserts nor updates that column.
 */
export const upsert: UpsertSignatures = function (
  table: Table,
  values: Insertable | Insertable[],
  conflictTarget: Column | Column[] | Constraint<Table>,
  options?: UpsertOptions<Table, ColumnsOption<Table>, ExtrasOption<Table>, UpdateColumns<Table>, UpsertReportAction>
): SQLFragment<any> {

  if (Array.isArray(values) && values.length === 0) return insert(table, values);  // punt a no-op to plain insert
  if (typeof conflictTarget === 'string') conflictTarget = [conflictTarget];  // now either Column[] or Constraint
  values = undefinedAsMissing(values, false);

  let noNullUpdateColumns = options?.noNullUpdateColumns ?? [];
  if (noNullUpdateColumns !== all && !Array.isArray(noNullUpdateColumns)) noNullUpdateColumns = [noNullUpdateColumns];

  let specifiedUpdateColumns = options?.updateColumns;
  if (specifiedUpdateColumns && !Array.isArray(specifiedUpdateColumns)) specifiedUpdateColumns = [specifiedUpdateColumns];

  const
    completedValues = Array.isArray(values) ? completeKeysWithDefaultValue(values, Default) : [values],
    firstRow = completedValues[0],
    insertColsSQL = cols(firstRow),
    insertValuesSQL = mapWithSeparator(completedValues, sql`, `, v => sql`(${vals(v)})`),
    colNames = Object.keys(firstRow) as Column[],
    updateValues = options?.updateValues ?? {},
    conflictColumns = Array.isArray(conflictTarget) ? conflictTarget : [],  // a constraint's are unknown here
    overwritesMissingKey = specifiedUpdateColumns == null && Array.isArray(values) && colNames.some(c =>
      updateValues[c] === undefined &&  // as below: otherwise, c is set from EXCLUDED
      !conflictColumns.includes(c) &&  // on conflict, EXCLUDED.c equals the existing value
      values.some(v => !Object.prototype.hasOwnProperty.call(v, c))),
    updateColumns = [...new Set(  // deduplicate the keys here
      [...specifiedUpdateColumns as string[] ?? colNames, ...Object.keys(updateValues)]
    )],
    conflictTargetSQL = Array.isArray(conflictTarget) ?
      sql`(${mapWithSeparator(conflictTarget, sql`, `, c => c)})` :
      sql<string>`ON CONSTRAINT ${conflictTarget.value}`,
    updateColsSQL = mapWithSeparator(updateColumns, sql`, `, c => c),
    updateValuesSQL = mapWithSeparator(updateColumns, sql`, `, c =>
      updateValues[c] !== undefined ? updateValueSQL(updateValues[c]) :
        (noNullUpdateColumns === all || noNullUpdateColumns.includes(c)) ? sql`CASE WHEN EXCLUDED.${c} IS NULL THEN ${table}.${c} ELSE EXCLUDED.${c} END` :
          sql`EXCLUDED.${c}`),
    returningSQL = SQLForColumnsOfTable(options?.returning, table),
    extrasSQL = SQLForExtras(options?.extras),
    suppressReport = options?.reportAction === 'suppress';

  // a key missing from some row is inserted as DEFAULT, then `SET col = EXCLUDED.col` overwrites the existing
  // value: Postgres can't tell that DEFAULT from a given one, so only the caller knows which columns to update
  if (overwritesMissingKey) {
    if (getConfig().upsertRequiresSameKeys ?? false) throw new Error('rows have different keys: pass updateColumns, or give every row the same keys');
    warnOnce('PGCAST_DEP001', 'upsert() of rows with different keys, without updateColumns: a key missing from one row is inserted as DEFAULT, then overwrites the existing value on conflict. Set upsertRequiresSameKeys: true (db.setConfig) to throw instead; it will be the default in pgcast 7.0.');
  }

  // the added-on $action = 'INSERT' | 'UPDATE' key takes after SQL Server's approach to MERGE
  // (and on the use of xmax for this purpose, see: https://stackoverflow.com/questions/39058213/postgresql-upsert-differentiate-inserted-and-updated-rows-using-system-columns-x)

  const
    insertPart = sql`INSERT INTO ${table} (${insertColsSQL}) VALUES ${insertValuesSQL}`,
    conflictPart = sql`ON CONFLICT ${conflictTargetSQL} DO`,
    conflictActionPart = updateColsSQL.length > 0 ? sql`UPDATE SET (${updateColsSQL}) = ROW(${updateValuesSQL})` : sql`NOTHING`,
    reportPart = sql` || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END)`,
    returningPart = sql`RETURNING ${returningSQL}${extrasSQL}${suppressReport ? [] : reportPart} AS result`,
    query = sql`${insertPart} ${conflictPart} ${conflictActionPart} ${returningPart}`;

  query.runResultTransform = Array.isArray(values) ?
    (qr) => qr.rows.map(r => r.result) :
    (qr) => qr.rows[0]?.result;

  return query;
};


/* === update === */

interface UpdateSignatures {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    values: UpdatableForTable<T>,
    where: WhereableForTable<T> | SQLFragment<any>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
}

/**
 * Generate an `UPDATE` query `SQLFragment`.
 * @param table The table to update
 * @param values An `Updatable` of the new values with which to update the table.
 * It needs at least one key: with none, there is nothing to set, and `update()`
 * throws before any query. A key whose value is `undefined` counts, sets the
 * column to `NULL`, and emits a `DeprecationWarning` (`PGCAST_DEP002`), once;
 * with the `undefinedMeansMissing` config option (the default in 7.0), it is
 * left out, as `JSON.stringify` leaves it out, and does not count:
 * `{ name: 'A', isLiving: undefined }` gives `SET ("name") = ROW($1)`.
 * @param where A `Whereable` (or `SQLFragment`) defining which rows to update
 */
export const update: UpdateSignatures = function (
  table: Table,
  values: Updatable,
  where: Whereable | SQLFragment<any>,
  options?: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>>
): SQLFragment {

  values = undefinedAsMissing(values, false);
  // `SET () = ROW()` is a syntax error in Postgres, so say so before any query
  if (Object.keys(values).length === 0) throw new Error('nothing to update: an Updatable needs at least one column');

  // note: the ROW() constructor below is required in Postgres 10+ if we're updating a single column
  // more info: https://www.postgresql-archive.org/Possible-regression-in-UPDATE-SET-lt-column-list-gt-lt-row-expression-gt-with-just-one-single-column0-td5989074.html

  const
    returningSQL = SQLForColumnsOfTable(options?.returning, table),
    extrasSQL = SQLForExtras(options?.extras),
    query = sql`UPDATE ${table} SET (${cols(values)}) = ROW(${vals(values)}) WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;

  query.runResultTransform = (qr) => qr.rows.map(r => r.result);
  return query;
};


/* === delete === */

export interface DeleteSignatures {
  <T extends Table, C extends ColumnsOption<T>, E extends ExtrasOption<T>>(
    table: T,
    where: WhereableForTable<T> | SQLFragment<any>,
    options?: ReturningOptionsForTable<T, C, E>
  ): SQLFragment<ReturningTypeForTable<T, C, E>[]>;
}

/**
 * Generate an `DELETE` query `SQLFragment` (plain 'delete' is a reserved word)
 * @param table The table to delete from
 * @param where A `Whereable` (or `SQLFragment`) defining which rows to delete
 */
export const deletes: DeleteSignatures = function (
  table: Table,
  where: Whereable | SQLFragment<any>,
  options?: ReturningOptionsForTable<Table, ColumnsOption<Table>, ExtrasOption<Table>>
): SQLFragment {

  const
    returningSQL = SQLForColumnsOfTable(options?.returning, table),
    extrasSQL = SQLForExtras(options?.extras),
    query = sql`DELETE FROM ${table} WHERE ${where} RETURNING ${returningSQL}${extrasSQL} AS result`;

  query.runResultTransform = (qr) => qr.rows.map(r => r.result);
  return query;
};


/* === truncate === */

type TruncateIdentityOpts = 'CONTINUE IDENTITY' | 'RESTART IDENTITY';
type TruncateForeignKeyOpts = 'RESTRICT' | 'CASCADE';

interface TruncateSignatures {
  (table: Table | Table[]): SQLFragment<undefined>;
  (table: Table | Table[], optId: TruncateIdentityOpts): SQLFragment<undefined>;
  (table: Table | Table[], optFK: TruncateForeignKeyOpts): SQLFragment<undefined>;
  (table: Table | Table[], optId: TruncateIdentityOpts, optFK: TruncateForeignKeyOpts): SQLFragment<undefined>;
}

/**
 * Generate a `TRUNCATE` query `SQLFragment`.
 * @param table The table (or array thereof) to truncate
 * @param opts Options: 'CONTINUE IDENTITY'/'RESTART IDENTITY' and/or 
 * 'RESTRICT'/'CASCADE'
 */
export const truncate: TruncateSignatures = function (
  table: Table | Table[],
  ...opts: string[]
): SQLFragment<undefined> {

  if (!Array.isArray(table)) table = [table];
  // without strictNullChecks, `undefined` or `null` gets past the type: join() makes it empty, as in 6.6.1
  for (const opt of opts) if (opt != null && !['CONTINUE IDENTITY', 'RESTART IDENTITY', 'RESTRICT', 'CASCADE'].includes(opt)) throw new Error(`Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '${opt}'`);
  const
    tables = mapWithSeparator(table, sql`, `, t => t),
    query = sql<SQL, undefined>`TRUNCATE ${tables}${raw((opts.length ? ' ' : '') + opts.join(' '))}`;

  return query;
};


/* === select === */

interface OrderSpecForTable<T extends Table> {
  by: SQLForTable<T>;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

type Unprefixed<S extends string> = S extends `${infer _}.${infer Rest}` ? Rest : S;

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
  having?: WhereableForTable<T> | SQLFragment<any>;
  lateral?: L;
  alias?: A;
  lock?: SelectLockingOptions<NoInfer<A>> | SelectLockingOptions<NoInfer<A>>[];
};

type SelectReturnTypeForTable<
  T extends Table,
  C extends ColumnsOption<T>,
  L extends LateralOption<C, E>,
  E extends ExtrasOption<T>,
> =
  (undefined extends L ? ReturningTypeForTable<T, C, E> :
    L extends SQLFragmentMap ? ReturningTypeForTable<T, C, E> & LateralResult<L> :
    L extends SQLFragment<any> ? RunResultForSQLFragment<L> :
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
    [SelectResultMode.ExactlyOne]: SelectReturnTypeForTable<T, C, L, E>;
    [SelectResultMode.One]: SelectReturnTypeForTable<T, C, L, E> | undefined;
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
    where: WhereableForTable<T> | SQLFragment<any> | AllType,
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
 * @param options Options object. Keys (all optional) are: 
 * * `columns` — an array of column names: only these columns will be returned
 * * `order` – an array of `OrderSpec` objects, such as 
 * `{ by: 'column', direction: 'ASC' }`  
 * * `limit` and `offset` – numbers: apply this limit and offset to the query
 * * `lateral` — either an object mapping keys to nested `select`/`selectOne`/
 * `count` queries to be `LATERAL JOIN`ed, or a single `select`/`selectOne`/
 * `count` query whose result will be passed through directly as the result of
 * the containing query; each key is also one identifier in the SQL, any `"`
 * doubled (`{ 'a"b': … }` gives `LEFT JOIN LATERAL (…) AS "lateral_a""b" ON true`)
 * * `alias` — table alias (string): required if using `lateral` to join a table
 * to itself; the alias, or the table name, is also one identifier in the
 * sub-select that `select` wraps the query in, any `"` doubled
 * (`AS "sq_a""b"`)
 * * `extras` — an object mapping key(s) to `SQLFragment`s, so that derived 
 * quantities can be included in the JSON result
 * @param mode (Used internally by `selectOne` and `count`)
 * @param aggregate (Used internally by `count`, `sum`, `avg`, `min` and `max`)
 * The name of the aggregate function, plain, quoted or `U&` quoted, in up to
 * three dotted parts (`sum`, `my_schema."MyAgg"`, `my_db.my_schema.my_agg`);
 * anything else, a `UESCAPE` clause included, throws. With
 * `columns: ['id']`, `'my_schema."MyAgg"'` gives
 * `SELECT my_schema."MyAgg"("id") AS result FROM "users"`.
 */
export const select: SelectSignatures = function (
  table: Table,
  where: Whereable | SQLFragment<any> | AllType = all,
  options: SelectOptionsForTable<Table, ColumnsOption<Table>, LateralOption<ColumnsOption<Table>, ExtrasOption<Table>>, ExtrasOption<Table>, any> = {},
  mode: SelectResultMode = SelectResultMode.Many,
  aggregate: string = 'count',
) {

  if (mode === SelectResultMode.Numeric && !functionName.test(aggregate)) throw new Error(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);

  const
    limit1 = mode === SelectResultMode.One || mode === SelectResultMode.ExactlyOne,
    allOptions = limit1 ? { ...options, limit: 1 } : options,
    alias = allOptions.alias || table,
    { distinct, groupBy, having, lateral, columns, extras } = allOptions,
    lock = allOptions.lock === undefined || Array.isArray(allOptions.lock) ? allOptions.lock : [allOptions.lock],
    order = allOptions.order === undefined || Array.isArray(allOptions.order) ? allOptions.order : [allOptions.order],
    tableAliasSQL = alias === table ? [] : sql<string>` AS ${alias}`,
    distinctSQL = !distinct ? [] : sql` DISTINCT${distinct instanceof SQLFragment || typeof distinct === 'string' ? sql` ON (${distinct})` :
      Array.isArray(distinct) ? sql` ON (${cols(distinct)})` : []}`,
    colsSQL = lateral instanceof SQLFragment ? [] :
      mode === SelectResultMode.Numeric ?
        (columns ? sql`${raw(aggregate)}(${cols(columns)})` : sql`${raw(aggregate)}(*)`) :
        SQLForColumnsOfTable(columns, alias as Table),
    colsExtraSQL = lateral instanceof SQLFragment || mode === SelectResultMode.Numeric ? [] : SQLForExtras(extras),
    colsLateralSQL = lateral === undefined || mode === SelectResultMode.Numeric ? [] :
      lateral instanceof SQLFragment ? sql`"lateral_passthru".result` :
        sql` || jsonb_build_object(${mapWithSeparator(
          Object.keys(lateral).sort(), sql`, `, k => sql`${param(k)}::text, ${SQLForAlias('lateral_', k)}.result`)})`,
    allColsSQL = sql`${colsSQL}${colsExtraSQL}${colsLateralSQL}`,
    whereSQL = where === all ? [] : sql` WHERE ${where}`,
    groupBySQL = !groupBy ? [] : sql` GROUP BY ${groupBy instanceof SQLFragment || typeof groupBy === 'string' ? groupBy : cols(groupBy)}`,
    havingSQL = !having ? [] : sql` HAVING ${having}`,
    orderSQL = order === undefined ? [] :
      sql` ORDER BY ${mapWithSeparator(order as OrderSpecForTable<Table>[], sql`, `, o => {  // `as` clause is required when TS not strict
        if (!['ASC', 'DESC'].includes(o.direction)) throw new Error(`Direction must be ASC/DESC, not '${o.direction}'`);
        if (o.nulls && !['FIRST', 'LAST'].includes(o.nulls)) throw new Error(`Nulls must be FIRST/LAST/undefined, not '${o.nulls}'`);
        return sql`${o.by} ${raw(o.direction)}${o.nulls ? sql` NULLS ${raw(o.nulls)}` : []}`;
      })}`,
    limitSQL = allOptions.limit === undefined ? [] :
      allOptions.withTies ? sql` FETCH FIRST ${param(allOptions.limit)} ROWS WITH TIES` :
        sql` LIMIT ${param(allOptions.limit)}`,  // compatibility with pg pre-10.5; and fewer bytes!
    offsetSQL = allOptions.offset === undefined ? [] : sql` OFFSET ${param(allOptions.offset)}`,  // pg is lax about OFFSET following FETCH, and we exploit that
    lockSQL = lock === undefined ? [] : (lock as SelectLockingOptions<string>[]).map(lock => {  // `as` clause is required when TS not strict
      if (!['UPDATE', 'NO KEY UPDATE', 'SHARE', 'KEY SHARE'].includes(lock.for)) throw new Error(`Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '${lock.for}'`);
      if (lock.wait && !['NOWAIT', 'SKIP LOCKED'].includes(lock.wait)) throw new Error(`Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '${lock.wait}'`);
      const
        ofTables = lock.of === undefined || Array.isArray(lock.of) ? lock.of : [lock.of],
        ofClause = ofTables === undefined ? [] : sql` OF ${mapWithSeparator(ofTables as Table[], sql`, `, t => t)}`;  // `as` clause is required when TS not strict
      return sql` FOR ${raw(lock.for)}${ofClause}${lock.wait ? sql` ${raw(lock.wait)}` : []}`;
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
    rowsQuery = sql<SQL, any>`SELECT${distinctSQL} ${allColsSQL} AS result FROM ${table}${tableAliasSQL}${lateralSQL}${whereSQL}${groupBySQL}${havingSQL}${orderSQL}${limitSQL}${offsetSQL}${lockSQL}`,
    query = mode !== SelectResultMode.Many ? rowsQuery :
      // we need the aggregate to sit in a sub-SELECT in order to keep ORDER and LIMIT working as usual
      sql<SQL, any>`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (${rowsQuery}) AS ${SQLForAlias('sq_', alias)}`;

  query.runResultTransform =

    mode === SelectResultMode.Numeric ?
      // note: pg deliberately returns strings for int8 in case 64-bit numbers overflow
      // (see https://github.com/brianc/node-pg-types#use), but we assume our counts aren't that big
      (qr) => Number(qr.rows[0].result) :

      mode === SelectResultMode.ExactlyOne ?
        (qr) => {
          const result = qr.rows[0]?.result;
          if (result === undefined) throw new NotExactlyOneError(query, 'One result expected but none returned (hint: check `.query.compile()` on this Error)');
          return result;
        } :
        // SelectResultMode.One or SelectResultMode.Many
        (qr) => qr.rows[0]?.result;

  return query;
};


/* === selectOne === */

export interface SelectOneSignatures {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string,
  >(
    table: T,
    where: WhereableForTable<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<FullSelectReturnTypeForTable<T, C, L, E, SelectResultMode.One>>;
}

/**
 * Generate a `SELECT` query `SQLFragment` that returns only a single result (or 
 * undefined). A `LIMIT 1` clause is added automatically. This can be nested with 
 * other `select`/`selectOne`/`count` queries using the `lateral` option.
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
};


/* === selectExactlyOne === */

export interface SelectExactlyOneSignatures {
  <
    T extends Table,
    C extends ColumnsOption<T>,
    L extends LateralOption<C, E>,
    E extends ExtrasOption<T>,
    A extends string,
  >(
    table: T,
    where: WhereableForTable<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<FullSelectReturnTypeForTable<T, C, L, E, SelectResultMode.ExactlyOne>>;
}

/**
 * Generate a `SELECT` query `SQLFragment` that returns a single result or 
 * throws an error. A `LIMIT 1` clause is added automatically. This can be 
 * nested with other `select`/`selectOne`/`count` queries using the `lateral` 
 * option.
 * @param table The table to select from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be selected,
 * or `all`
 * @param options Options object. See documentation for `select` for details.
 */

export const selectExactlyOne: SelectExactlyOneSignatures = function (table, where, options = {}) {
  return select(table, where, options, SelectResultMode.ExactlyOne);
};


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
    where: WhereableForTable<T> | SQLFragment<any> | AllType,
    options?: SelectOptionsForTable<T, C, L, E, A>,
  ): SQLFragment<number>;
}

/**
 * Generate a `SELECT` query `SQLFragment` that returns a count. This can be 
 * nested in other `select`/`selectOne` queries using their `lateral` option.
 * @param table The table to count from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be counted, 
 * or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 */
export const count: NumericAggregateSignatures = function (table, where, options?) {
  return select(table, where, options, SelectResultMode.Numeric);
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a sum. This can be 
 * nested in other `select`/`selectOne` queries using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 */
export const sum: NumericAggregateSignatures = function (table, where, options?) {
  return select(table, where, options, SelectResultMode.Numeric, 'sum');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns an arithmetic mean via
 * the `avg` aggregate function. This can be nested in other `select`/
 * `selectOne` queries using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 */
export const avg: NumericAggregateSignatures = function (table, where, options?) {
  return select(table, where, options, SelectResultMode.Numeric, 'avg');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a minimum via the `min`
 * aggregate function. This can be nested in other `select`/`selectOne` queries
 * using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be 
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 */
export const min: NumericAggregateSignatures = function (table, where, options?) {
  return select(table, where, options, SelectResultMode.Numeric, 'min');
};

/**
 * Generate a `SELECT` query `SQLFragment` that returns a maximum via the `max`
 * aggregate function. This can be nested in other `select`/`selectOne` queries
 * using their `lateral` option.
 * @param table The table to aggregate from
 * @param where A `Whereable` or `SQLFragment` defining the rows to be
 * aggregated, or `all`
 * @param options Options object. Useful keys may be: `columns`, `alias`.
 */
export const max: NumericAggregateSignatures = function (table, where, options?) {
  return select(table, where, options, SelectResultMode.Numeric, 'max');
};
