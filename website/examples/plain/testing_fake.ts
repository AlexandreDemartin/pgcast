import * as db from 'zapatos/db';
declare function test(name: string, fn: () => Promise<void>): void;
declare const assert: { deepEqual(actual: unknown, expected: unknown): void };
// The function of « The function to test », which the build checks against that block
// #region copy
async function programme(queryable: db.Queryable, studio_id: number) {
  const films = await db.select('films', { studio_id }, {
    columns: ['title', 'release_year'],
    order: { by: 'release_year', direction: 'ASC' },
  }).run(queryable);
  return films.map(film => `${film.title} (${film.release_year})`);
}
// #endregion copy
// ---cut---
type Films = db.FullSelectReturnTypeForTable<
  'films', ['title', 'release_year'], undefined, undefined, db.SelectResultMode.Many>;

const answering = (rows: object[]) => ({ query: async () => ({ rows }) }) as unknown as db.Queryable;

test('programme() gives each film its year', async () => {
  const films: Films = [
    { title: 'The Quiet Ferry', release_year: 1988 },
    { title: 'Tidewater', release_year: 2021 },
  ];
  const queryable = answering([{ result: films }]);  // select() reads one row, its column result

  assert.deepEqual(await programme(queryable, 1000), ['The Quiet Ferry (1988)', 'Tidewater (2021)']);
});
