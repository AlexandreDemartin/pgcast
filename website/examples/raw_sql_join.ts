import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
type Tables = s.films.SQL | s.screenings.SQL | s.cinemas.SQL;
type Listing = Pick<s.films.Selectable, 'title'> & Pick<s.screenings.Selectable, 'starts_at'>;

function listings(cinema: string) {
  return db.sql<Tables, Listing[]>`SELECT ${'films'}.${'title'}, ${'screenings'}.${'starts_at'}
    FROM ${'screenings'}
    JOIN ${'films'} ON ${'films'}.${'id'} = ${'screenings'}.${'film_id'}
    JOIN ${'cinemas'} ON ${'cinemas'}.${'id'} = ${'screenings'}.${'cinema_id'}
    WHERE ${'cinemas'}.${'name'} = ${db.param(cinema)}
    ORDER BY ${'screenings'}.${'starts_at'}`;
}

const listed = await listings('The Lantern').run(pool);
