// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/core.ts against Postgres: what the SQL compiled in
// test/unit/core.test.ts does once run on the fixture, surprises included.

import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, raw, cols, vals, parent, self, Default } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

afterEach(resetConfig);

describe('identifiers, raw, arrays', () => {
  it('runs a query built from quoted, dotted and pre-quoted identifiers', async () => {
    const q = sql`SELECT ${'display_name'}, ${'"select"'} FROM ${'public.users'}, ${'"OrderLines"'}
      WHERE ${{ id: 1 }} AND ${'"lineNo"'} = 1${raw(' ORDER BY 1')}`;
    expect(await q.run(t.client)).toEqual([{ display_name: 'Ada', select: 'gift' }]);
  });
});

describe('param', () => {
  it('sends plain values; pg serialises arrays as Postgres arrays and objects as JSON', async () => {
    const q = sql`SELECT ${param(1)}::int AS n, ${param([1, 2])}::int[] AS a, ${param({ a: 1 })}::jsonb AS o,
      ${param(null)}::text AS z, ${param(undefined)}::text AS u`;
    expect(await q.run(t.client)).toEqual([{ n: 1, a: [1, 2], o: { a: 1 }, z: null, u: null }]);
  });

  it('a text cast to a simple type works', async () => {
    expect(await sql`SELECT ${param('2026-01-31', 'date')} + 1 AS d`.run(t.client))
      .toEqual([{ d: new Date(2026, 1, 1) }]);
  });

  it('characterization: a schema-qualified or array type cast fails', async () => {
    // characterization: "public.mood" and "int[]" are taken as single type names
    expect(await pgError(t.client, () => sql`SELECT ${param('ok', 'public.mood')}`.run(t.client)))
      .toMatchInlineSnapshot(`
        {
          "code": "42704",
          "message": "type "public.mood" does not exist",
        }
      `);
    expect(await pgError(t.client, () => sql`SELECT ${param([1], 'int[]')}`.run(t.client)))
      .toMatchInlineSnapshot(`
        {
          "code": "42704",
          "message": "type "int[]" does not exist",
        }
      `);
  });

  it('a JSON cast (true, or the config) sends JSON text', async () => {
    db.setConfig({ castObjectParamsToJson: true });
    const q = sql`SELECT ${param([1, 'a'], true)}::jsonb AS a, ${param({ b: [2] })}::jsonb AS o`;
    expect(await q.run(t.client)).toEqual([{ a: [1, 'a'], o: { b: [2] } }]);
  });

  it('characterization: castArrayParamsToJson breaks comparing an array column with an array value', async () => {
    // characterization: the config applies to every array parameter, so `int4[] = json` has no operator
    db.setConfig({ castArrayParamsToJson: true });
    const q = sql`SELECT count(*)::int AS n FROM ${'accounts'} WHERE ${{ scores: [1, 2, 3] }}`;
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42883",
        "message": "operator does not exist: integer[] = json",
      }
    `);
  });
});

describe('Default, self, parent, cols, vals', () => {
  it('cols / vals of an object insert in sorted key order, with DEFAULT and fragments', async () => {
    const values = { owner_id: 2, balance: sql`${param(5)} * 2`, lifetime_ops: Default, ratio: param('0.25', 'float8') };
    const q = sql`INSERT INTO ${'accounts'} (${cols(values)}) VALUES (${vals(values)})
      RETURNING ${'balance'}, ${'lifetime_ops'}, ${'ratio'}`;
    expect(await q.run(t.client)).toEqual([{ balance: '10.00', lifetime_ops: '0', ratio: 0.25 }]);
  });

  it('self and parent() resolve inside a nested fragment', async () => {
    const reports = sql`SELECT count(*)::int FROM ${'users'} AS "r" WHERE ${{ manager_id: sql`"r".${self} = ${parent('id')}` }}`
      .copy({ parentTable: 'u' });
    const q = sql`SELECT ${'display_name'}, (${reports}) AS reports FROM ${'users'} AS "u" ORDER BY ${'id'}`;
    expect(await q.run(t.client)).toEqual([
      { display_name: 'Ada', reports: 2 }, { display_name: 'Bob', reports: 0 }, { display_name: 'Cyd', reports: 0 },
    ]);
  });

  it('characterization: vals of an array fails on a Parameter or Default element', async () => {
    // characterization: the Parameter is sent JSON-stringified; the Symbol cannot be serialised by pg
    const withParam = sql`SELECT ${'id'} FROM ${'users'} WHERE ${'id'} IN (${vals([param(1)])})`;
    expect(await pgError(t.client, () => withParam.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "22P02",
        "message": "invalid input syntax for type integer: "{"value":1}"",
      }
    `);
    const withDefault = sql`SELECT ${'id'} FROM ${'users'} WHERE ${'id'} IN (${vals([Default])})`;
    expect(await pgError(t.client, () => withDefault.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "22P02",
        "message": "invalid input syntax for type integer: "Symbol(DEFAULT)"",
      }
    `);
  });
});

describe('Whereable', () => {
  const ids = (where: db.SQL) => sql`SELECT ${'id'} FROM ${'users'} WHERE ${where} ORDER BY ${'id'}`.run(t.client);

  it('an empty Whereable matches every row', async () => {
    expect(await ids({})).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('several keys are ANDed', async () => {
    expect(await ids({ manager_id: 1, mood: 'ok' })).toEqual([{ id: 2 }]);
  });

  it('characterization: a null or undefined value matches no row', async () => {
    // characterization: `"manager_id" = NULL` is never true, although Ada's manager_id is NULL
    expect(await ids({ manager_id: null })).toEqual([]);
    expect(await ids({ manager_id: undefined })).toEqual([]);
  });

  it('characterization: a Parameter value fails', async () => {
    // characterization: param(1) is wrapped in a second Parameter and sent as '{"value":1}'
    expect(await pgError(t.client, () => ids({ id: param(1) }))).toMatchInlineSnapshot(`
      {
        "code": "22P02",
        "message": "invalid input syntax for type integer: "{"value":1}"",
      }
    `);
  });
});

describe('SQLFragment.run', () => {
  it('prepared(): a named statement can be run twice on the same connection', async () => {
    const name = `pgcast_core_${Date.now()}`;
    const q = sql`SELECT ${'display_name'} FROM ${'users'} WHERE ${{ id: 2 }}`.prepared(name);
    expect(await q.run(t.client)).toEqual([{ display_name: 'Bob' }]);
    expect(await q.run(t.client)).toEqual([{ display_name: 'Bob' }]);
  });

  it('noop: returns noopResult without hitting the database, unless forced', async () => {
    const q = sql`SELECT no_such_column`;
    q.noop = true;
    q.noopResult = 'skipped';
    expect(await q.run(t.client)).toBe('skipped');
    expect(await pgError(t.client, () => q.run(t.client, true))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "no_such_column" does not exist",
      }
    `);
  });

  it('queryListener and resultListener see every run, no-ops included', async () => {
    const seen: unknown[] = [];
    db.setConfig({
      queryListener: (query, txnId) => seen.push(['query', query, txnId]),
      resultListener: (result, txnId, elapsedMs, query) => seen.push(['result', result, txnId, typeof elapsedMs, query?.text]),
    });
    await sql`SELECT ${param(1)}::int AS one`.run(t.client);
    const noop = sql`SELECT 2`;
    noop.noop = true;
    noop.noopResult = 'none';
    await noop.run(t.client);
    expect(seen).toMatchInlineSnapshot(`
      [
        [
          "query",
          {
            "text": "SELECT $1::int AS one",
            "values": [
              1,
            ],
          },
          undefined,
        ],
        [
          "result",
          [
            {
              "one": 1,
            },
          ],
          undefined,
          "number",
          "SELECT $1::int AS one",
        ],
        [
          "query",
          {
            "text": "/* marked no-op: won't hit DB unless forced -> */ SELECT 2",
            "values": [],
          },
          undefined,
        ],
        [
          "result",
          "none",
          undefined,
          "number",
          "/* marked no-op: won't hit DB unless forced -> */ SELECT 2",
        ],
      ]
    `);
  });
});
