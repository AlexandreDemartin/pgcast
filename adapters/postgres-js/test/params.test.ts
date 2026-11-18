// Copyright (C) 2026 Alexandre Demartin
//
// The parameter table (README § What it writes): each value written through pg and through the adapter, in the
// same query, is stored the same, read back as text, or refused with the same SQLSTATE.

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { asPool, type PostgresJsPool } from '../src';
import { refusal, shape, usePostgresJs } from './helpers';

const u = usePostgresJs();

// a sql whose `types` has a serializer, which postgres.js 4 reads to decide whether to describe a statement first
let typedSql: ReturnType<typeof postgres> | undefined, typedPool: PostgresJsPool;
beforeAll(() => {
  typedSql = postgres(urlForDatabase(inject('pgcastDb')!.url, u.t.name), { max: 2, onnotice: () => { }, types: { bigint: postgres.BigInt } });
  typedPool = asPool(typedSql);
});
afterAll(async () => { await typedSql?.end({ timeout: 1 }); });

beforeAll(async () => {
  await u.t.pool.query(`CREATE TABLE written (k serial, c_text text, c_int8 int8, c_numeric numeric, c_bool bool,
    c_json json, c_jsonb jsonb, c_bytea bytea, c_date date, c_ts timestamp, c_tstz timestamptz, c_interval interval,
    c_point point, c_int4a int4[], c_texta text[], c_jsonba jsonb[], c_datea date[], c_tsa timestamp[],
    c_mood public.mood, c_mooda public.mood[], c_pref public.preferences, c_ticket public.ticket_no, c_tags public.tag_list)`);
});

const
  at = new Date('2026-06-01T10:00:00.123Z'),
  into = (column: string) => `INSERT INTO written (${column}) VALUES ($1) RETURNING ${column}::text AS t`,
  select = (expr: string) => `SELECT (${expr})::text AS t`;

const cases: [string, string, unknown][] = [
  ['an object to jsonb', into('c_jsonb'), { a: 1 }],
  ['JSON text to jsonb', into('c_jsonb'), '{"a":1}'],
  ['an array to jsonb', into('c_jsonb'), [1, 2]],
  ['an object to json', into('c_json'), { a: 1 }],
  ['JSON text to CAST($1 AS "json"), as param(x, true) sends it', select('CAST($1 AS "json")'), '{"a":1}'],
  ['the JSON text of an array to CAST($1 AS "json")', select('CAST($1 AS "json")'), '[1,2]'],
  ['an object to a domain over jsonb', into('c_pref'), { a: 1 }],
  ['JSON text to a domain over jsonb', into('c_pref'), '{"a":1}'],
  ['a string to int8', into('c_int8'), '9007199254740993'],
  ['a bigint to int8', into('c_int8'), BigInt('9007199254740993')],
  ['a number to int8', into('c_int8'), 42],
  ['a string to a domain over int8', into('c_ticket'), '9007199254740993'],
  ['a string to numeric', into('c_numeric'), '1.10'],
  ['a number to numeric', into('c_numeric'), 0.1],
  ['true to bool', into('c_bool'), true],
  ["'true' to bool", into('c_bool'), 'true'],
  ['a Date to timestamp', into('c_ts'), at],
  ['a string to timestamp', into('c_ts'), '2026-06-01 12:00:00'],
  ["'infinity' to timestamp", into('c_ts'), 'infinity'],
  ['a Date to timestamptz', into('c_tstz'), at],
  ['a string with an offset to timestamptz', into('c_tstz'), '2026-06-01 12:00:00+02'],
  ['a string with no offset to timestamptz', into('c_tstz'), '2026-06-01 12:00:00'],
  ['a Date at local midnight to date', into('c_date'), new Date(2026, 5, 1)],
  ['a string to date', into('c_date'), '2026-06-01'],
  ['a Buffer to bytea', into('c_bytea'), Buffer.from('deadbeef', 'hex')],
  ['a Uint8Array to bytea', into('c_bytea'), new Uint8Array([0xde, 0xad])],
  ['a \\x string to bytea', into('c_bytea'), '\\xdeadbeef'],
  ['a Date to text', into('c_text'), at],
  ['an object to text', into('c_text'), { a: 1 }],
  ['a number to text', into('c_text'), 1.5],
  ['an object with toPostgres() to text', into('c_text'), { toPostgres: () => 'tp' }],
  ['undefined to text', into('c_text'), undefined],
  ['null to text', into('c_text'), null],
  ['a string to interval', into('c_interval'), '1 day 02:00'],
  ['a string to point', into('c_point'), '(1,2)'],
  ['{ x, y } to point', into('c_point'), { x: 1, y: 2 }],
  ['an array to int4[]', into('c_int4a'), [1, 2]],
  ['array text to int4[]', into('c_int4a'), '{1,2}'],
  ['an array of commas, quotes, NULL, an empty string and a backslash to text[]', into('c_texta'), ['a,b', 'c"d', 'NULL', null, '', 'e\\f']],
  ['an empty array to text[]', into('c_texta'), []],
  ['an array of two dimensions to text[]', into('c_texta'), [['a', 'b'], ['c', 'd']]],
  ['an array of objects to jsonb[]', into('c_jsonba'), [{ a: 1 }, null]],
  ['an array of Dates to date[]', into('c_datea'), [new Date(2026, 5, 1)]],
  ['an array of Dates to timestamp[]', into('c_tsa'), [at]],
  ['a string to an enum', into('c_mood'), 'ok'],
  ['an array of strings to an enum[]', into('c_mooda'), ['ok', 'sad']],
  ['an array to a domain over text[]', into('c_tags'), ['a', 'b']],
  ['a string to $1 alone', 'SELECT $1 AS t', 'x'],
  ['a number to $1 alone', 'SELECT $1 AS t', 1],
  ['a Date to $1 alone', 'SELECT $1 AS t', at],
  ['true to $1 alone', 'SELECT $1 AS t', true],
  ['a string to $1::int8 + 1', select('$1::int8 + 1'), '9007199254740993'],
  ['a bigint to $1 + 1', select('$1 + 1'), BigInt(10)],
  ['an array to int4[] @> $1', select('ARRAY[1,2] @> $1'), [1]],
  ["a Date to date_trunc('day', $1)", select(`date_trunc('day', $1)`), at],
  ['an object to to_jsonb($1)', select('to_jsonb($1)'), { a: 1 }],
  ['JSON text to jsonb = $1', select(`'{"a":1}'::jsonb = $1`), '{"a":1}'],
  ['an object to jsonb @> $1', select(`'{"a":1}'::jsonb @> $1`), { a: 1 }],
  ['a string to jsonb ? $1', select(`'{"a":1}'::jsonb ? $1`), 'a'],
];

type Queryable = { query: (q: { text: string; values: any[]; name?: string }) => PromiseLike<{ rows: any[] }> };
const written = async (q: Queryable, text: string, value: unknown, values: unknown[] = [value], name?: string) => {
  try { return shape((await q.query({ text, values, name })).rows[0].t); }
  catch (e) { return refusal(e); }
};

// a NULL in $2, as db.insert() sends a null column: postgres.js 4 then describes the statement first
const besideNull = (text: string) => `WITH beside AS (SELECT $2::text AS n) ${text}`;

describe('writes as pg writes:', () => {
  it.each(cases)('%s', async (_, text, value) => {
    expect(await written(u.pool, text, value)).toEqual(await written(u.t.pool, text, value));
  });

  it.each(cases)('%s, beside a NULL, unprepared and prepared twice, on a sql with types too', async (label, text, value) => {
    const name = 'beside_' + cases.findIndex(c => c[0] === label), pg = await written(u.t.pool, besideNull(text), value, [value, null]);
    const runs = async (pool: Queryable) => [
      await written(pool, besideNull(text), value, [value, null]),
      await written(pool, besideNull(text), value, [value, null], name),
      await written(pool, besideNull(text), value, [value, null], name),
    ];
    expect({ default: await runs(u.pool), types: await runs(typedPool) }).toEqual({ default: [pg, pg, pg], types: [pg, pg, pg] });
  });

  it('after DEALLOCATE ALL, which drops the statements of the connection', async () => {
    const sql = postgres(urlForDatabase(inject('pgcastDb')!.url, u.t.name), { max: 2, onnotice: () => { } }), pool = asPool(sql);
    try {
      const c = await pool.connect(), seen: Record<string, unknown[]> = {}, expected: Record<string, unknown[]> = {};
      try {
        for (const [label, text, value] of cases.filter(c => /JSON text to CAST|'true' to bool|\\x string|an object to jsonb$/.test(c[0]))) {
          const pg = await written(u.t.pool, text, value);
          for (const [via, q] of [['pool', pool], ['client', c]] as const) {
            const key = via + ': ' + label, name = 'deallocated_' + via;
            seen[key] = [await written(q, text, value), await written(q, text, value, [value], name)];
            await q.query({ text: 'DEALLOCATE ALL', values: [] });
            seen[key].push(await written(q, text, value), await written(q, text, value, [value], name));
            expected[key] = [pg, pg, pg, pg];
          }
        }
      } finally { c.release(); }
      expect(Object.keys(seen)).toHaveLength(8);
      expect(seen).toEqual(expected);
    } finally { await sql.end({ timeout: 1 }); }
  });

  it('several values, as IN ($1, $2)', async () => {
    const query = { text: select('2 IN ($1, $2)'), values: [1, 2] };
    expect((await u.pool.query(query)).rows).toEqual((await u.t.pool.query(query)).rows);
  });
});

describe('the difference README § What it writes lists', () => {
  it('stores a Buffer for a text column as its hex, where pg sends its bytes', async () => {
    const hi = Buffer.from('hi');
    expect(await written(u.t.pool, into('c_text'), hi)).toBe('hi');
    expect(await written(u.pool, into('c_text'), hi)).toBe('\\x6869');
  });
});
