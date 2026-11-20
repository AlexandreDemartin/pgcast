// Copyright (C) 2026 Alexandre Demartin

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, inject, it, vi } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { describeQuery } from '../src/describe';
import { textTypes } from '../src/values';
import { writeQueries } from '../src/write';

// Use the registrations of the pg copy under test, including array OIDs absent from pg.types.builtins.
const fromPg = createRequire(require.resolve('pg')),
  fromTypes = createRequire(fromPg.resolve('pg-types')),
  registered: number[] = [];
fromTypes('./lib/textParsers').init((oid: number) => registered.push(oid));

it('covers exactly the default text parser registrations', () => {
  expect(Object.isFrozen(textTypes)).toBe(true);
  expect(Object.keys(textTypes).map(Number).sort()).toEqual(registered.sort());
});

const point = '{ x: number; y: number }', date = 'Date | number',
  interval = expect.objectContaining({ days: 1, toPostgres: expect.any(Function), toISO: expect.any(Function) }),
  json = { a: [1, null] }, bytes = Buffer.from([0, 255]);

// Each expression goes through both Describe -> writer and a separate default text query.
const cases: [number | null, string, string, unknown][] = [
  [16, 'true', 'boolean', true],
  [17, "decode('00ff','hex')", 'Buffer', bytes],
  [20, '9007199254740993::int8', 'string', '9007199254740993'],
  [21, '2::int2', 'number', 2], [23, '3::int4', 'number', 3], [26, '4::oid', 'number', 4],
  [700, '1.5::float4', 'number', 1.5], [701, '2.5::float8', 'number', 2.5],
  [114, '\'{"a":[1,null]}\'::json', 'JSONValue', json], [3802, '\'{"a":[1,null]}\'::jsonb', 'JSONValue', json],
  [600, 'point(1,2)', point, { x: 1, y: 2 }],
  [718, 'circle(point(1,2),3)', '{ x: number; y: number; radius: number }', { x: 1, y: 2, radius: 3 }],
  [1186, "interval '1 day'", 'PostgresInterval', interval],
  [1000, 'ARRAY[true]', 'PgArray<boolean>', [true]],
  [1001, "ARRAY[decode('00ff','hex')]", 'PgArray<Buffer>', [bytes]],
  [1005, 'ARRAY[2::int2]', 'PgArray<number>', [2]],
  [1007, 'ARRAY[1,NULL]', 'PgArray<number>', [1, null]],
  [1007, 'ARRAY[[1,NULL],[NULL,2]]', 'PgArray<number>', [[1, null], [null, 2]]],
  [1028, 'ARRAY[4::oid]', 'PgArray<number>', [4]],
  [1016, 'ARRAY[9007199254740993::int8]', 'PgArray<string>', ['9007199254740993']],
  [1017, 'ARRAY[point(1,2)]', 'PgArray<' + point + '>', [{ x: 1, y: 2 }]],
  [1021, 'ARRAY[1.5::float4]', 'PgArray<number>', [1.5]], [1022, 'ARRAY[2.5::float8]', 'PgArray<number>', [2.5]],
  [1231, 'ARRAY[1.25::numeric]', 'PgArray<number>', [1.25]],
  [1231, 'amounts', 'PgArray<number>', [1.25, null]],
  [1231, '(amounts || amounts)::public.amount_list', 'PgArray<number>', [1.25, null, 1.25, null]],
  [651, "ARRAY['192.0.2.0/24'::cidr]", 'PgArray<string>', ['192.0.2.0/24']],
  [1008, "ARRAY['pg_catalog.int4out'::regproc]", 'PgArray<string>', ['int4out']],
  [1009, "ARRAY['abc'::text]", 'PgArray<string>', ['abc']],
  [1014, "ARRAY['a'::char(2)]", 'PgArray<string>', ['a ']], [1015, "ARRAY['ab'::varchar]", 'PgArray<string>', ['ab']],
  [1040, "ARRAY['08:00:2b:01:02:03'::macaddr]", 'PgArray<string>', ['08:00:2b:01:02:03']],
  [1041, "ARRAY['192.0.2.1'::inet]", 'PgArray<string>', ['192.0.2.1']],
  [1183, "ARRAY[time '12:30']", 'PgArray<string>', ['12:30:00']],
  [1270, "ARRAY[timetz '12:30+00']", 'PgArray<string>', ['12:30:00+00']],
  [1187, "ARRAY[interval '1 day']", 'PgArray<PostgresInterval>', [interval]],
  [199, 'ARRAY[\'{"a":[1,null]}\'::json]', 'PgArray<JSONValue>', [json]],
  [3807, 'ARRAY[\'{"a":[1,null]}\'::jsonb]', 'PgArray<JSONValue>', [json]],
  [3907, "ARRAY['[1,2)'::numrange]", 'PgArray<string>', ['[1,2)']],
  [2951, "ARRAY['00000000-0000-0000-0000-000000000000'::uuid]", 'PgArray<string>', ['00000000-0000-0000-0000-000000000000']],
  [791, 'ARRAY[2::money]', 'PgArray<string>', ['$2.00']],
  [1700, '1.25::numeric', 'string', '1.25'],
  [null, "ARRAY['happy'::public.mood]", 'string', '{happy}'],
];
for (const [oid, arrayOid, type] of [[1082, 1182, 'date'], [1114, 1115, 'timestamp'], [1184, 1185, 'timestamptz']] as const) {
  for (const [literal, value] of [['2000-01-02', new Date('2000-01-02T00:00:00.000Z')], ['infinity', Infinity], ['-infinity', -Infinity]] as const) {
    cases.push([oid, `'${literal}'::${type}`, date, value],
      [arrayOid, `ARRAY['${literal}'::${type}]`, 'PgArray<Date | number>', [value]]);
  }
}

describe('driver values', () => {
  const db = useTestDatabase();
  it('writes the type beside the decoded value for each registered OID and the text fallback', async () => {
    const client = new pg.Client({ connectionString: urlForDatabase(inject('pgcastDb')!.url, db.name) }),
      dir = await mkdtemp(join(tmpdir(), 'pgcast-values-')), path = join(dir, 'queries.ts');
    try {
      vi.stubEnv('TZ', 'UTC');
      await client.connect();
      await client.query("SET TIME ZONE 'UTC'");
      await client.query("SET lc_monetary = 'C'");
      await client.query('CREATE DOMAIN public.amount_list AS numeric[]');
      await client.query('CREATE TEMP TABLE balances (amounts public.amount_list)');
      await client.query('INSERT INTO balances VALUES (ARRAY[1.25,NULL])');
      const text = 'SELECT ' + cases.map(([, sql], i) => sql + ' AS c' + i).join(', ') + ' FROM balances',
        { fields } = await describeQuery(client, text), { rows: [row] } = await client.query(text);
      await writeQueries(path, 'zapatos/db', new Map([['values', { text, fields }]]));
      const written = await readFile(path, 'utf8');
      expect(registered.filter(oid => !cases.some(([id]) => oid === id))).toEqual([]);
      for (const [i, [oid, sql, type, value]] of cases.entries()) {
        if (oid === null) expect(registered).not.toContain(fields![i].dataTypeID);
        else expect(fields![i].dataTypeID, sql).toBe(oid);
        expect(written, sql).toContain(`"c${i}": ${type} | null;`);
        expect(row['c' + i], sql).toEqual(value);
      }
    } finally {
      vi.unstubAllEnvs();
      await client.end();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
