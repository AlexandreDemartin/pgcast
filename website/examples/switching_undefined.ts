import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
db.setConfig({ undefinedMeansMissing: true });

const films = await db.update('films', {
  title: 'The Salt Orchard',
  tagline: undefined,  // from a form that left it out: the column keeps its value
}, { id: 1000 }, { returning: ['id', 'title', 'tagline'] }).run(pool);
