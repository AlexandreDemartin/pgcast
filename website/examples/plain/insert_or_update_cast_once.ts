import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
async function castOnce(queryable: db.Queryable, role: s.roles.Insertable & { film_id: number; billing: number }) {
  const added = await db.upsert('roles', role, ['film_id', 'billing'], { updateColumns: db.doNothing }).run(queryable);
  return added ?? await db.selectExactlyOne('roles', { film_id: role.film_id, billing: role.billing }).run(queryable);
}

const role = await castOnce(pool, { film_id: 1001, billing: 3, actor_id: 1007, character: 'Aunt Lise' });
