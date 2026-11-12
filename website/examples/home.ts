import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const authorBooks = await db.select('authors', db.all, {
  lateral: {
    books: db.select('books', {
      authorId: db.parent('id'),
    }),
  },
}).run(pool);
