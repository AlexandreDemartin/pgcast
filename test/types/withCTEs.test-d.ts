// Copyright (C) 2026 Alexandre Demartin
//
// Types of withCTEs() (src/db/shortcuts.ts) on the fixture schema: the main query's own type, so its result,
// whatever the CTEs, a map built at run time included; refused: a CTE or a main query that is no fragment.
// An aggregate under withCTEs(): ./aggregates.test-d.ts.

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import { all, sql } from 'zapatos/db';
import type * as s from 'zapatos/schema';

declare const pool: db.Queryable;
declare const ctes: { [name: string]: db.SQLFragment };
const recent = sql<s.users.SQL>`SELECT ${'id'} FROM ${'users'} WHERE ${'manager_id'} = ${db.param(1)}`;

describe('withCTEs()', () => {
  test('keeps the result of each shortcut', async () => {
    expectTypeOf(await db.withCTEs({ recent }, db.select('users', all, { columns: ['id'] })).run(pool)).toEqualTypeOf<{ id: number }[]>();
    expectTypeOf(await db.withCTEs({ recent }, db.selectOne('users', all, { columns: ['id'] })).run(pool)).toEqualTypeOf<{ id: number } | undefined>();
    expectTypeOf(await db.withCTEs({ recent }, db.selectExactlyOne('users', all, { columns: ['id'] })).run(pool)).toEqualTypeOf<{ id: number }>();
    expectTypeOf(await db.withCTEs({ recent }, db.count('users', all)).run(pool)).toEqualTypeOf<number>();
    expectTypeOf(await db.withCTEs({ recent }, db.insert('users', { email: 'eve@example.com', display_name: 'Eve' }, { returning: ['id'] })).run(pool))
      .toEqualTypeOf<{ id: number }>();
    expectTypeOf(await db.withCTEs({ recent }, sql`SELECT 1`).run(pool)).toEqualTypeOf<any[]>();
    expectTypeOf(await db.withCTEs({ recent }, db.count('users', all)).run(pool)).not.toBeAny();
    expectTypeOf(await db.withCTEs({ recent }, db.selectOne('users', all)).run(pool)).not.toBeAny();
    // @ts-expect-error a count is a number
    db.withCTEs({ recent }, db.count('users', all)).run(pool).then((n): string => n);
  });

  test('the same with no CTE and with a map built at run time', async () => {
    const one = db.selectOne('users', all, { columns: ['display_name'] });
    expectTypeOf(db.withCTEs({}, one)).toEqualTypeOf(one);
    expectTypeOf(await db.withCTEs({}, one).run(pool)).toEqualTypeOf<{ display_name: string } | undefined>();
    expectTypeOf(await db.withCTEs(ctes, one).run(pool)).toEqualTypeOf<{ display_name: string } | undefined>();
    expectTypeOf(await db.withCTEs(ctes, db.count('users', all)).run(pool)).toEqualTypeOf<number>();
    expectTypeOf(await db.withCTEs(ctes, one).run(pool)).not.toBeAny();
  });

  test('typed as the shortcut nested in extras and in a lateral', async () => {
    const user = await db.selectExactlyOne('users', { id: 1 }, {
      columns: ['id'],
      extras: { n: db.withCTEs({ recent }, db.count('accounts', all)) },
      lateral: { boss: db.withCTEs({ recent }, db.selectOne('users', all, { columns: ['display_name'] })) },
    }).run(pool);
    expectTypeOf(user.n).toEqualTypeOf<number>();
    expectTypeOf(user.boss).toEqualTypeOf<{ display_name: string } | null>();
    expectTypeOf(user.boss).not.toBeAny();
  });

  test('refuses a CTE or a main query that is no fragment', () => {
    // @ts-expect-error a CTE is a fragment, not a table's name
    db.withCTEs({ recent: 'users' }, db.count('users', all));
    // @ts-expect-error nor a Whereable
    db.withCTEs({ recent: { id: 1 } }, db.count('users', all));
    // @ts-expect-error the main query is a fragment too
    db.withCTEs({ recent }, 'users');
    // @ts-expect-error the CTEs are an object of fragments, not an array
    db.withCTEs([recent], db.count('users', all));
  });
});
