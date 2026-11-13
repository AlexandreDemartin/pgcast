/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

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
} from './core';

import { mapWithSeparator } from './utils';
import type { Whereable } from 'zapatos/schema';

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
export const isTrue = sql<SQL, boolean>`${self} IS TRUE`;
export const isNotTrue = sql<SQL, boolean>`${self} IS NOT TRUE`;
export const isFalse = sql<SQL, boolean>`${self} IS FALSE`;
export const isNotFalse = sql<SQL, boolean>`${self} IS NOT FALSE`;
export const isUnknown = sql<SQL, boolean>`${self} IS UNKNOWN`;
export const isNotUnknown = sql<SQL, boolean>`${self} IS NOT UNKNOWN`;

export const isDistinctFrom = <T>(a: T) => sql<SQL, boolean, T>`${self} IS DISTINCT FROM ${conditionalParam(a)}`;
export const isNotDistinctFrom = <T>(a: T) => sql<SQL, boolean, T>`${self} IS NOT DISTINCT FROM ${conditionalParam(a)}`;

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

export const isIn = <T>(a: readonly T[]) => a.length > 0 ? sql<SQL, boolean | null, T>`${self} IN (${vals(a)})` : sql`false`;
export const isNotIn = <T>(a: readonly T[]) => a.length > 0 ? sql<SQL, boolean | null, T>`${self} NOT IN (${vals(a)})` : sql`true`;

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

// things that aren't genuinely conditions
type PluralisingIntervalUnit = 'microsecond' | 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'decade';
type IntervalUnit = PluralisingIntervalUnit | `${PluralisingIntervalUnit}s` | 'century' | 'centuries' | 'millennium' | 'millennia';
export const fromNow = (n: number, unit: IntervalUnit = 'millisecond') => sql`now() + ${param(String(n) + ' ' + unit)}`;
export const after = gt;
export const before = lt;
export const now = sql`now()`;

// these are really more operations than conditions, but we sneak them in here for now, for use e.g. in UPDATE queries
/** `"col" + $1`, of a number or a `Date`. To add days to a date: `` sql`${self} + ${param(3, 'int4')}` ``. */
export const add = <T extends number | Date>(a: T) => sql<SQL, number, T>`${self} + ${conditionalParam(a)}`;
/** `"col" - $1`, of a number or a `Date`. To subtract days from a date: `` sql`${self} - ${param(3, 'int4')}` ``. */
export const subtract = <T extends number | Date>(a: T) => sql<SQL, number, T>`${self} - ${conditionalParam(a)}`;
