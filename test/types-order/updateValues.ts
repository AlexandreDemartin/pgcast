// Copyright (C) 2026 Alexandre Demartin
//
// param() of a string literal in upsert()'s updateValues, after the statements that made TypeScript 5.9 infer it as a
// string (#538): the slot's type read through upsert()'s own signature, then an upsert() generic over the table and a
// concrete one. Zapatos 6.6.1 takes each call in any order; this program fixes one order, so each line is checked
// in the order that refused it.

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

type UsersUpdateValues = NonNullable<NonNullable<
  Parameters<typeof db.upsert<'users', undefined, undefined, undefined, undefined>>[3]>['updateValues']>;
export const usersSlot = null! as UsersUpdateValues[keyof UsersUpdateValues];
export const touchUser = <T extends 'users'>(table: T, row: s.InsertableForTable<T>, on: s.ColumnForTable<T>, at: Date) =>
  db.upsert(table, row, on, { updateValues: { created_at: at } });

const user = { email: 'a@b', display_name: 'A' };
db.upsert('users', user, 'email', { updateValues: { manager_id: null } });
// an enum label, a timestamptz string
db.upsert('users', user, 'email', { updateValues: { mood: db.param('sad') } });
db.upsert('users', user, 'email', { updateValues: { created_at: db.param('2020-01-01T00:00:00Z') } });

type ZooUpdateValues = NonNullable<NonNullable<
  Parameters<typeof db.upsert<'extra.type_zoo', undefined, undefined, undefined, undefined>>[3]>['updateValues']>;
export const zooSlot = null! as ZooUpdateValues[keyof ZooUpdateValues];
export const touchZoo = <T extends 'extra.type_zoo'>(table: T, row: s.InsertableForTable<T>, on: s.ColumnForTable<T>, at: Date) =>
  db.upsert(table, row, on, { updateValues: { c_timestamptz: at } });

db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_int4: null } });
// a time, a timetz, an int8 domain typed Int8String, an int8 and a date string
db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_time: db.param('12:00:00') } });
db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_timetz: db.param('12:00:00+00') } });
db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_int8_domain: db.param('1') } });
db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_int8: db.param('1') } });
db.upsert('extra.type_zoo', {}, 'id', { updateValues: { c_date: db.param('2020-01-01') } });
