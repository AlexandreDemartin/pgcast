// Copyright (C) 2026 Alexandre Demartin
//
// A library's functions that return an aggregate, with aggregatesTypedByColumn declared in ConfigTypes:
// this program emits declarations (tsconfig.json), as a package built with `declaration: true` does, so
// every type these functions return must have a name a .d.ts can write (TS4023 otherwise).

import * as db from 'zapatos/db';

export const accountCount = () => db.count('accounts', db.all);
export const totalBalance = () => db.sum('accounts', db.all, { columns: ['balance'] });
export const meanRatio = () => db.avg('accounts', db.all, { columns: ['ratio'] });
export const firstEvent = () => db.min('events', db.all, { columns: ['occurred_on'] });
export const lastName = () => db.max('users', db.all, { columns: ['display_name'] });

export const userWithAggregates = (id: number) => db.selectOne('users', { id }, {
  lateral: {
    accounts: db.count('accounts', { owner_id: db.parent('id') }),
    total: db.sum('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
    mean: db.avg('accounts', { owner_id: db.parent('id') }, { columns: ['ratio'] }),
    first: db.min('events', db.all, { columns: ['occurred_on'] }),
    last: db.max('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
  },
});

export const firstEventOfUser = (id: number) => db.selectOne('users', { id }, { lateral: db.min('events', db.all, { columns: ['occurred_on'] }) });

// every function and value of zapatos/db and of db.conditions re-exported, as a wrapper module does: each type must be
// one a .d.ts can name (TS4023 otherwise), so a type that names an unexported interface is written inline
export const {
  mapWithSeparator, getConfig, setConfig, Default, self, all, toBuffer, Parameter, DangerousRawString, ColumnNames,
  ColumnValues, ParentColumn, SQLFragment, strict, param, raw, cols, vals, parent, sql, toDate, toString,
  isDatabaseError, insert, Constraint, doNothing, upsert, update, deletes, truncate, SelectResultMode,
  NotExactlyOneError, select, selectOne, selectExactlyOne, count, sum, avg, min, max, constraint, IsolationLevel,
  transaction, serializable, repeatableRead, readCommitted, serializableRO, repeatableReadRO, readCommittedRO,
  serializableRODeferrable, enableCustomJSONParsingForLargeNumbers,
} = db;
export const {
  isNull, isNotNull, isTrue, isNotTrue, isFalse, isNotFalse, isUnknown, isNotUnknown, isDistinctFrom,
  isNotDistinctFrom, eq, ne, gt, gte, lt, lte, between, betweenSymmetric, notBetween, notBetweenSymmetric, like,
  notLike, ilike, notIlike, similarTo, notSimilarTo, reMatch, reImatch, notReMatch, notReImatch, isIn, isNotIn, eqAny,
  jsonbContains, jsonbPathExists, or, and, not, arrayContains, arrayContainedIn, arrayOverlaps, exists, isInSelect,
  websearchToTsquery, fromNow, after, before, now, add, subtract,
} = db.conditions;
