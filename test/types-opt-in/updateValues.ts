// Copyright (C) 2026 Alexandre Demartin
//
// A library's value typed by upsert()'s updateValues slot for a column of primitives: it declares nothing in
// ConfigTypes, but sits in this program as it emits declarations (tsconfig.json), so the slot's type must be one
// a .d.ts can write out (TS2527 for a unique symbol shortcuts.ts does not export, #503).

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

type UsersUpdateValues = NonNullable<NonNullable<
  Parameters<typeof db.upsert<'users', undefined, undefined, undefined, undefined>>[3]>['updateValues']>;

export function updateValue<K extends keyof UsersUpdateValues>(_column: K) { return null! as UsersUpdateValues[K]; }
export const displayNameUpdate = updateValue('display_name');
export const settingsUpdate = updateValue('settings');

// A library's upsert() generic over the table, whose updateValues is checked against the table, as with Zapatos 6.6.1,
// and whose .d.ts writes its result type out (#533)
export const touchUser = <T extends 'users'>(table: T, row: s.InsertableForTable<T>, on: s.ColumnForTable<T>, at: Date) =>
  db.upsert(table, row, on, { updateValues: { created_at: at } });

