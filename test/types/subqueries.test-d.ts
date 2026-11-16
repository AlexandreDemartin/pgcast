// Copyright (C) 2026 Alexandre Demartin
//
// Types of exists() and isInSelect() (src/db/conditions.ts) on the fixture schema: the
// subquery's Whereable and column checked against its table, the constraint each puts on
// the outer key, and the run result (note 006 § What #562 builds).

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import { all, parent } from 'zapatos/db';
import type * as s from 'zapatos/schema';

const { exists, isInSelect, and, or, not, like } = db.conditions;
declare const pool: db.Queryable;

describe('exists()', () => {
  test('is a boolean with no constraint, so it fits under any key, in and(), or() and not(), or as the where', async () => {
    const e = exists('extra.articles', { author_id: parent('id'), body: like('Notes%') }, { parent: 'users' });
    expectTypeOf(e).toEqualTypeOf<db.SQLFragment<boolean, never>>();
    expectTypeOf(e).not.toBeAny();
    const rows = await db.select('users', e).run(pool);
    expectTypeOf(rows).toEqualTypeOf<s.users.JSONSelectable[]>();
    db.select('users', and({ mood: 'happy' }, exists('extra.articles', all)));
    db.select('users', not(exists('users', { manager_id: parent('id') }, { parent: 'users', alias: 'reports' })));
    db.select('users', or({ id: 1 }, exists('extra.articles', {})));
    db.select('users', { display_name: exists('extra.articles', all), id: exists('extra.articles', all) });
    db.deletes('extra.articles', exists('users', { id: parent('reviewer_id') }, { parent: 'extra.articles' }));
    db.sql<s.users.SQL>`SELECT 1 FROM ${'users'} WHERE ${exists('extra.articles', db.sql`${'author_id'} = ${parent('id')}`, { parent: 'users' })}`;
  });

  test('refuses a table, a key or an option the schema does not have', () => {
    // @ts-expect-error a table that does not exist
    exists('nope', all);
    // @ts-expect-error display_name is a column of users, not of extra.articles
    exists('extra.articles', { display_name: 'Ada' });
    // @ts-expect-error a value of another type than the inner column's (author_id is an int)
    exists('extra.articles', { author_id: 'Ada' });
    // @ts-expect-error parent is a string
    exists('extra.articles', all, { parent: 1 });
    // @ts-expect-error alias is a string
    exists('extra.articles', all, { alias: true });
    // @ts-expect-error the where is required: all for every row
    exists('extra.articles');
  });
});

describe('isInSelect()', () => {
  test('is typed on the subquery column, null aside, and gives boolean | null', async () => {
    expectTypeOf(isInSelect('extra.articles', all, 'author_id')).toEqualTypeOf<db.SQLFragment<boolean | null, number>>();
    expectTypeOf(isInSelect('extra.articles', all, 'reviewer_id')).toEqualTypeOf<db.SQLFragment<boolean | null, number>>();
    expectTypeOf(isInSelect('users', all, 'mood')).toEqualTypeOf<db.SQLFragment<boolean | null, s.mood>>();
    expectTypeOf(isInSelect('users', all, 'created_at')).toEqualTypeOf<db.SQLFragment<boolean | null, Date>>();
    expectTypeOf(isInSelect('users', all, 'id')).not.toBeAny();
    const rows = await db.select('users', { id: isInSelect('extra.articles', { body: like('Notes%') }, 'author_id') }).run(pool);
    expectTypeOf(rows).toEqualTypeOf<s.users.JSONSelectable[]>();
    db.select('users', {
      id: not(isInSelect('extra.articles', all, 'reviewer_id')),
      manager_id: isInSelect('users', { mood: 'sad' }, 'id', { alias: 'reports' }),
      mood: isInSelect('users', all, 'mood'),
      email: isInSelect('users', all, 'email'),
      created_at: isInSelect('users', all, 'created_at'),
      settings: isInSelect('users', all, 'settings'),
    });
  });

  test('refuses a column of another table, or of another type than the key', () => {
    // @ts-expect-error display_name is a column of users, not of extra.articles
    isInSelect('extra.articles', all, 'display_name');
    // @ts-expect-error a key of another table in the inner where
    isInSelect('extra.articles', { display_name: 'Ada' }, 'author_id');
    // @ts-expect-error the column is required
    isInSelect('extra.articles', all);
    // @ts-expect-error an int subquery column under a text key
    db.select('users', { display_name: isInSelect('extra.articles', all, 'author_id') });
    // @ts-expect-error a text subquery column under an int key
    db.select('users', { id: isInSelect('users', all, 'display_name') });
    // @ts-expect-error a text subquery column under an enum key (a mood under a text key passes: a mood is a string)
    db.select('users', { mood: isInSelect('users', all, 'display_name') });
  });
});
