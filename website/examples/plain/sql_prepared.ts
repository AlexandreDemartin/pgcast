import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const filmById = (id: number) => db.selectOne('films', { id }).prepared('film_by_id');

console.log(filmById(1000).compile().name);  // film_by_id

const client = await pool.connect();
try {
  await filmById(1000).run(client);  // Postgres prepares the statement on this connection, then runs it
  await filmById(1001).run(client);  // and runs it by name: the same text, other values
} finally {
  client.release();
}
