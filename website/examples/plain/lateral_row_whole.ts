import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const query = db.select('films', db.all, {
  columns: ['title', 'release_year'],
  lateral: {
    studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }),
    castSize: db.count('roles', { film_id: db.parent('id') }),
  },
});
type FilmCard = Awaited<ReturnType<typeof query.run>>[number];
const card = (film: FilmCard) => `${film.title} (${film.release_year}), ${film.studio.name}: ${film.castSize} roles`;

const cards = (await query.run(pool)).map(card);
