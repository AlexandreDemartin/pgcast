import { expectTypeOf, test } from 'vitest';
import * as db from '../src/db';

test('sql<> carries its RunResult type', () => {
  const q = db.sql<db.SQL, { one: number }[]>`SELECT 1 AS one`;
  expectTypeOf(q.run).returns.resolves.toEqualTypeOf<{ one: number }[]>();
});
