import * as db from 'zapatos/db';
declare function test(name: string, fn: () => void): void;
declare const assert: { deepEqual(actual: unknown, expected: unknown): void };
// The function of « Test the query a function builds », which the build checks against that block
// #region copy
function filmSearch(params: URLSearchParams) {
  const words = params.get('title'), before = params.get('before');
  return db.select('films', {
    ...(words === null ? {} : { title: db.conditions.ilike(`%${words}%`) }),
    ...(before === null ? {} : { release_year: db.conditions.lt(Number(before)) }),
  }, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } });
}
// #endregion copy
// ---cut---
test('filmSearch() filters on each parameter it is given', () => {
  assert.deepEqual(filmSearch(new URLSearchParams('title=lantern&before=2000')).compile(), db.select('films', {
    title: db.conditions.ilike('%lantern%'),
    release_year: db.conditions.lt(2000),
  }, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } }).compile());
});

test('filmSearch() filters on nothing when given nothing', () => {
  assert.deepEqual(filmSearch(new URLSearchParams()).compile(),
    db.select('films', {}, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } }).compile());
});
