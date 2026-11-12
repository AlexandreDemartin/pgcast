import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
declare function test(name: string, fn: () => void): void;
declare const assert: { equal(actual: unknown, expected: unknown): void; deepEqual(actual: unknown, expected: unknown): void };
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
// ---cut---
for (const cinema of [`x' OR TRUE --`, `x" --`]) {
  test(`listings() keeps ${cinema} a value`, () => {
    const { text, values } = listings(cinema).compile();
    assert.deepEqual(values, [cinema]);
    assert.equal(text.replace(/\s+/g, ' '), 'SELECT "films"."title", "screenings"."starts_at" FROM "screenings" '
      + 'JOIN "films" ON "films"."id" = "screenings"."film_id" JOIN "cinemas" ON "cinemas"."id" = "screenings"."cinema_id" '
      + 'WHERE "cinemas"."name" = $1 ORDER BY "screenings"."starts_at"');
  });
}
