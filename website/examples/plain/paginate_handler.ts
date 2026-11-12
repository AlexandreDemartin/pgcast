import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// The two functions of « Send the cursor to the client », which the build checks against that block
// #region copy
type Cursor = { release_year: number; id: number };
function encodeCursor({ release_year, id }: Cursor): string {
  return Buffer.from(JSON.stringify({ release_year, id })).toString('base64url');
}
function decodeCursor(cursor: string): Cursor | undefined {
  try {
    const { release_year, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    const isKey = (key: number) => Number.isInteger(key) && Math.abs(key) < 2 ** 31;  // within Postgres's integer
    if (isKey(release_year) && isKey(id)) return { release_year, id };
  } catch {}  // not base64url JSON
  return undefined;
}
// #endregion copy
// ---cut---
const size = 2;

async function listFilms(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const studio = params.get('studio'), after = params.get('after');
  const cursor = after === null ? undefined : decodeCursor(after);
  const badStudio = studio !== null && !/^\d{1,9}$/.test(studio);  // 1 to 9 digits: within Postgres's integer
  const badCursor = after !== null && cursor === undefined;
  if (badStudio || badCursor) return Response.json({ error: 'Bad studio or cursor' }, { status: 400 });

  const filter: s.films.Whereable = studio === null ? {} : { studio_id: Number(studio) };
  const rows = await db.select('films', {
    ...filter,
    ...(cursor && {
      release_year: db.sql`(${db.self}, ${'id'}) < (${db.param(cursor.release_year)}, ${db.param(cursor.id)})`,
    }),
  }, {
    columns: ['id', 'title', 'release_year'],
    order: [
      { by: 'release_year', direction: 'DESC' },
      { by: 'id', direction: 'DESC' },
    ],
    limit: size + 1,  // one more than the page: if it comes back, there is a next page
  }).run(pool);

  const films = rows.slice(0, size), last = films.at(-1);
  const nextCursor = rows.length > size && last !== undefined ? encodeCursor(last) : null;
  const total = await db.count('films', filter).run(pool);  // the list's where, without the cursor
  return Response.json({ films, nextCursor, total });
}
