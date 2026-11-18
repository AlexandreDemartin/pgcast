import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
function mentorLateral<C extends s.crew.Column>(columns: C[]) {
  return db.selectOne('crew', { id: db.parent('mentor_id') }, { alias: 'mentor', columns });
}

const mentor = mentorLateral(['name', 'job']);
type Mentor = db.RunResultForSQLFragment<typeof mentor>;
const credit = (m: Mentor) => m ? `${m.name}, ${m.job}` : 'no mentor';

const crew = await db.select('crew', db.all, { columns: ['name'], lateral: { mentor } }).run(pool);
const credits = crew.map(member => credit(member.mentor));
