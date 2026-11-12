// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/shortcuts.ts, compilation only (no database): the
// `text` + `values` of each shortcut and option, as Zapatos 6.6.1 produces them.
// Execution on the fixture: test/integration/shortcuts.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, Default, all, conditions as dc } from '../../src/db';
import { resetConfig } from '../helpers/config';

describe('insert', () => {
  it('one row: columns in sorted key order, RETURNING to_jsonb', () => {
    // characterization: the column order is the sorted key order, not the object's
    expect(db.insert('users', { email: 'e@x.org', display_name: 'E', mood: 'ok' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email", "mood") VALUES ($1, $2, $3) RETURNING to_jsonb("users".*) AS result",
        "values": [
          "E",
          "e@x.org",
          "ok",
        ],
      }
    `);
  });

  it('several rows with different keys: the union of the keys, DEFAULT where a key is missing', () => {
    expect(db.insert('users', [
      { email: 'a@x.org', display_name: 'A' },
      { mood: 'ok', email: 'b@x.org', display_name: 'B', manager_id: 1 },
    ]).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email", "manager_id", "mood") VALUES ($1, $2, DEFAULT, DEFAULT), ($3, $4, $5, $6) RETURNING to_jsonb("users".*) AS result",
        "values": [
          "A",
          "a@x.org",
          "B",
          "b@x.org",
          1,
          "ok",
        ],
      }
    `);
  });

  it('an empty array: a no-op query', () => {
    const q = db.insert('users', []);
    expect(q.noop).toBe(true);
    expect(q.noopResult).toEqual([]);
    expect(q.compile()).toMatchInlineSnapshot(`
      {
        "text": "/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "users" SELECT null WHERE false",
        "values": [],
      }
    `);
  });

  it('returning and extras', () => {
    expect(db.insert('users', { email: 'e@x.org', display_name: 'E' }, {
      returning: ['id', 'email'],
      extras: { upper: sql`upper(${'display_name'})`, created: 'created_at' },
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) RETURNING jsonb_build_object($3::text, "id", $4::text, "email") || jsonb_build_object($5::text, upper("display_name"), $6::text, "created_at") AS result",
        "values": [
          "E",
          "e@x.org",
          "id",
          "email",
          "upper",
          "created",
        ],
      }
    `);
  });

  it('values: SQLFragment, Parameter with a cast, Default, undefined', () => {
    // characterization: an undefined value is sent as a parameter (NULL), not replaced by DEFAULT
    expect(db.insert('accounts', {
      owner_id: 1, balance: sql`1 + 1`, ratio: param('0.5', 'float8'), lifetime_ops: Default, overdraft_limit: undefined,
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "accounts" ("balance", "lifetime_ops", "overdraft_limit", "owner_id", "ratio") VALUES (1 + 1, DEFAULT, $1, $2, CAST($3 AS "float8")) RETURNING to_jsonb("accounts".*) AS result",
        "values": [
          undefined,
          1,
          "0.5",
        ],
      }
    `);
  });
});

describe('upsert', () => {
  const ada = { email: 'ada@example.com', display_name: 'Ada L.' };

  it('one conflict column: every inserted column is updated, $action reported', () => {
    expect(db.upsert('users', ada, 'email').compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
        ],
      }
    `);
  });

  it('several conflict columns and several rows', () => {
    expect(db.upsert('products', [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ], ['sku', 'variant']).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "products" ("price_cents", "sku", "title", "variant") VALUES ($1, $2, DEFAULT, $3), ($4, $5, $6, $7) ON CONFLICT ("sku", "variant") DO UPDATE SET ("sku", "variant", "price_cents", "title") = ROW(EXCLUDED."sku", EXCLUDED."variant", EXCLUDED."price_cents", EXCLUDED."title") RETURNING to_jsonb("products".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          1300,
          "TEE",
          "S",
          900,
          "CAP",
          "Cap",
          "",
        ],
      }
    `);
  });

  it('constraint(): ON CONFLICT ON CONSTRAINT', () => {
    expect(db.upsert('users', ada, db.constraint('users_email_key')).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ON CONSTRAINT "users_email_key" DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
        ],
      }
    `);
  });

  it('updateColumns: one column, or a list', () => {
    expect(db.upsert('users', ada, 'email', { updateColumns: 'display_name' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("display_name") = ROW(EXCLUDED."display_name") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
        ],
      }
    `);
    expect(db.upsert('users', { ...ada, mood: 'ok' }, 'email', { updateColumns: ['display_name', 'mood'] }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "INSERT INTO "users" ("display_name", "email", "mood") VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET ("display_name", "mood") = ROW(EXCLUDED."display_name", EXCLUDED."mood") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "values": [
            "Ada L.",
            "ada@example.com",
            "ok",
          ],
        }
      `);
  });

  it('updateValues: a fragment replaces EXCLUDED, and its key is added to the update columns', () => {
    expect(db.upsert('users', ada, 'email', {
      updateColumns: 'display_name',
      updateValues: { mood: sql`'happy'`, display_name: sql`${'users'}.${'display_name'} || ${param('!')}` },
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("display_name", "mood") = ROW("users"."display_name" || $3, 'happy') RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
          "!",
        ],
      }
    `);
  });

  it('updateValues: a plain value is a parameter, sent as update() sends it', () => {
    expect(db.upsert('users', ada, 'email', { updateValues: { mood: 'happy' } }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name", "mood") = ROW(EXCLUDED."email", EXCLUDED."display_name", $3) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
          "happy",
        ],
      }
    `);
    const plain = {
      string: 'x', number: 5, bigint: BigInt(5), boolean: true, null: null, date: new Date(0),
      array: [1, 2], object: { a: 1 }, emptyObject: {}, buffer: Buffer.from('ab'),
    };
    const compare = () => Object.entries(plain).forEach(([kind, v]) => {
      const
        upserted = db.upsert('accounts', { id: 1, owner_id: 1 }, 'id', { updateColumns: [], updateValues: { balance: v } } as any).compile(),
        updated = db.update('accounts', { balance: v } as any, { id: 1 }).compile();
      expect(upserted.text.replace(/.* DO UPDATE SET (.*) RETURNING .*/, '$1'), kind)
        .toBe(updated.text.replace(/.* SET (.*) WHERE .*/, '$1').replace('$1', '$3'));
      expect(upserted.values[2], kind).toBe(updated.values[0]);
    });
    compare();
    // with the JSON casts on, an array or an object is cast as update() casts it
    db.setConfig({ castArrayParamsToJson: true, castObjectParamsToJson: true });
    try {
      compare();
      expect(db.upsert('users', ada, 'email', { updateColumns: [], updateValues: { settings: { a: 1 } } }).compile().text)
        .toContain(`DO UPDATE SET ("settings") = ROW(CAST($3 AS "json")) RETURNING`);
    } finally {
      resetConfig();
    }
  });

  /** The `SET` of an upsert whose updateValues are `{ mood: v }`, and its parameters; or what it throws. */
  const set = (v: any) => {
    try {
      const q = db.upsert('users', ada, 'email', { updateColumns: [], updateValues: { mood: v } } as any).compile();
      return [q.text.replace(/.* DO UPDATE SET (.*) RETURNING .*/, '$1'), q.values.slice(2)];
    } catch (err) {
      return `throws: ${(err as Error).message}`;
    }
  };

  it('updateValues: pgcast objects compile as under 6.6.1, and a Parameter is not wrapped twice', () => {
    expect({
      param: set(param('happy')), cast: set(param('happy', 'mood')), default: set(Default),
      raw: set(db.raw('now()')), cols: set(db.cols(['a', 'b'])), vals: set(db.vals({ a: 1 })),
      parent: set(parent('id')), self: set(db.self), all: set(all),
    }).toMatchInlineSnapshot(`
      {
        "all": "throws: Cannot convert a Symbol value to a string",
        "cast": [
          "("mood") = ROW(CAST($3 AS "mood"))",
          [
            "happy",
          ],
        ],
        "cols": [
          "("mood") = ROW("a", "b")",
          [],
        ],
        "default": [
          "("mood") = ROW(DEFAULT)",
          [],
        ],
        "param": [
          "("mood") = ROW($3)",
          [
            "happy",
          ],
        ],
        "parent": "throws: The 'parent' table alias has no meaning here",
        "raw": [
          "("mood") = ROW(now())",
          [],
        ],
        "self": "throws: The 'self' column alias has no meaning here",
        "vals": [
          "("mood") = ROW($3)",
          [
            1,
          ],
        ],
      }
    `);
  });

  it('updateValues: an array that holds a pgcast object, at any depth, compiles item by item as under 6.6.1', () => {
    // as in a sql template: each item as if interpolated directly, so a string is an identifier and a number throws
    expect({
      sql: set([sql`upper(`, sql`EXCLUDED.mood`, sql`)`]), param: set([param('happy')]), raw: set([db.raw(`'happy'`)]),
      mapWithSeparator: set(db.mapWithSeparator(['ha', 'ppy'], sql` || `, c => param(c))), nested: set([[sql`'happy'`]]),
      default: set([Default]), string: set([sql`upper(`, 'excluded.mood', sql`)`]), number: set([sql`repeat('a', `, 3, sql`)`]),
      object: set([sql`'happy' || `, {}]),
    }).toMatchInlineSnapshot(`
      {
        "default": [
          "("mood") = ROW(DEFAULT)",
          [],
        ],
        "mapWithSeparator": [
          "("mood") = ROW($3 || $4)",
          [
            "ha",
            "ppy",
          ],
        ],
        "nested": [
          "("mood") = ROW('happy')",
          [],
        ],
        "number": "throws: Alien object while interpolating SQL: 3",
        "object": [
          "("mood") = ROW('happy' || TRUE)",
          [],
        ],
        "param": [
          "("mood") = ROW($3)",
          [
            "happy",
          ],
        ],
        "raw": [
          "("mood") = ROW('happy')",
          [],
        ],
        "sql": [
          "("mood") = ROW(upper(EXCLUDED.mood))",
          [],
        ],
        "string": [
          "("mood") = ROW(upper("excluded"."mood"))",
          [],
        ],
      }
    `);
    // an array of plain values only is one parameter, as update() sends it; so is what mapWithSeparator()
    // returns for one string or none, with no separator in it
    expect({
      strings: set(['a', 'b']), numbers: set([1, 2]), empty: set([]), objects: set([{}, { a: [1] }]),
      oneItem: set(db.mapWithSeparator(['users.mood'], sql` || `, c => c)),
      noItem: set(db.mapWithSeparator([], sql` || `, c => c)),
    }).toMatchInlineSnapshot(`
      {
        "empty": [
          "("mood") = ROW($3)",
          [
            [],
          ],
        ],
        "noItem": [
          "("mood") = ROW($3)",
          [
            [],
          ],
        ],
        "numbers": [
          "("mood") = ROW($3)",
          [
            [
              1,
              2,
            ],
          ],
        ],
        "objects": [
          "("mood") = ROW($3)",
          [
            [
              {},
              {
                "a": [
                  1,
                ],
              },
            ],
          ],
        ],
        "oneItem": [
          "("mood") = ROW($3)",
          [
            [
              "users.mood",
            ],
          ],
        ],
        "strings": [
          "("mood") = ROW($3)",
          [
            [
              "a",
              "b",
            ],
          ],
        ],
      }
    `);
  });

  it('updateValues: a plain object that holds a pgcast object, at any depth, compiles as under 6.6.1', () => {
    // as in a sql template: a WHERE-style condition of its keys, each value a fragment or a parameter
    expect({
      like: set({ 'users.mood': dc.like('h%') }), sql: set({ x: sql`'happy'` }), inArray: set([{ x: sql`'happy'` }]),
      nullPrototype: set(Object.assign(Object.create(null), { x: sql`'happy'` })),
      param: set({ 'users.mood': param('happy') }), deep: set({ a: { b: [db.raw(`'happy'`)] } }),
      default: set({ a: Default }), parent: set({ a: parent('id') }),
    }).toMatchInlineSnapshot(`
      {
        "deep": [
          "("mood") = ROW(("a" = $3))",
          [
            {
              "b": [
                DangerousRawString {
                  "value": "'happy'",
                },
              ],
            },
          ],
        ],
        "default": [
          "("mood") = ROW(("a" = $3))",
          [
            Symbol(DEFAULT),
          ],
        ],
        "inArray": [
          "("mood") = ROW((('happy')))",
          [],
        ],
        "like": [
          "("mood") = ROW((("users"."mood" LIKE $3)))",
          [
            "h%",
          ],
        ],
        "nullPrototype": [
          "("mood") = ROW((('happy')))",
          [],
        ],
        "param": [
          "("mood") = ROW(("users"."mood" = $3))",
          [
            Parameter {
              "cast": undefined,
              "value": "happy",
            },
          ],
        ],
        "parent": "throws: The 'parent' table alias has no meaning here",
        "sql": [
          "("mood") = ROW((('happy')))",
          [],
        ],
      }
    `);
    // an object or a class instance of plain values only is one parameter, as update() sends it; a function
    // in an object is data there too (a toPostgres() method), as under 6.6.1
    class Holder { x = sql`'happy'`; }
    expect({
      empty: set({}), nullPrototype: set(Object.create(null)), where: set({ 'users.mood': 'happy' }),
      date: set(new Date(0)), buffer: set(Buffer.alloc(0)), map: set(new Map()),
      toPostgres: set({ toPostgres: () => 'happy' }), inArray: set([{ toPostgres: () => 'happy' }]),
    }).toMatchInlineSnapshot(`
      {
        "buffer": [
          "("mood") = ROW($3)",
          [
            {
              "data": [],
              "type": "Buffer",
            },
          ],
        ],
        "date": [
          "("mood") = ROW($3)",
          [
            1970-01-01T00:00:00.000Z,
          ],
        ],
        "empty": [
          "("mood") = ROW($3)",
          [
            {},
          ],
        ],
        "inArray": [
          "("mood") = ROW($3)",
          [
            [
              {
                "toPostgres": [Function],
              },
            ],
          ],
        ],
        "map": [
          "("mood") = ROW($3)",
          [
            Map {},
          ],
        ],
        "nullPrototype": [
          "("mood") = ROW($3)",
          [
            {},
          ],
        ],
        "toPostgres": [
          "("mood") = ROW($3)",
          [
            {
              "toPostgres": [Function],
            },
          ],
        ],
        "where": [
          "("mood") = ROW($3)",
          [
            {
              "users.mood": "happy",
            },
          ],
        ],
      }
    `);
    expect(set(new Holder())[0]).toBe(`("mood") = ROW($3)`);
  });

  it('updateValues: a function or the global object throws, as under 6.6.1, alone or in an array', () => {
    const fn = () => 'happy';
    expect({ fn: set(fn), global: set(globalThis), inArray: set([fn]), globalInArray: set([globalThis]) })
      .toMatchInlineSnapshot(`
        {
          "fn": "throws: Alien object while interpolating SQL: () => "happy"",
          "global": "throws: Did you use \`self\` (the global object) where you meant \`db.self\` (the Zapatos value)? The global object cannot be embedded in a query.",
          "globalInArray": "throws: Did you use \`self\` (the global object) where you meant \`db.self\` (the Zapatos value)? The global object cannot be embedded in a query.",
          "inArray": "throws: Alien object while interpolating SQL: () => "happy"",
        }
      `);
  });

  it('noNullUpdateColumns: one column, a list, or all', () => {
    const values = { ...ada, mood: null };
    expect(db.upsert('users', values, 'email', { noNullUpdateColumns: 'mood' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email", "mood") VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name", "mood") = ROW(EXCLUDED."email", EXCLUDED."display_name", CASE WHEN EXCLUDED."mood" IS NULL THEN "users"."mood" ELSE EXCLUDED."mood" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
          null,
        ],
      }
    `);
    expect(db.upsert('users', values, 'email', { noNullUpdateColumns: ['mood', 'display_name'] }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "INSERT INTO "users" ("display_name", "email", "mood") VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name", "mood") = ROW(EXCLUDED."email", CASE WHEN EXCLUDED."display_name" IS NULL THEN "users"."display_name" ELSE EXCLUDED."display_name" END, CASE WHEN EXCLUDED."mood" IS NULL THEN "users"."mood" ELSE EXCLUDED."mood" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "values": [
            "Ada L.",
            "ada@example.com",
            null,
          ],
        }
      `);
    expect(db.upsert('users', values, 'email', { noNullUpdateColumns: all }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email", "mood") VALUES ($1, $2, $3) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name", "mood") = ROW(CASE WHEN EXCLUDED."email" IS NULL THEN "users"."email" ELSE EXCLUDED."email" END, CASE WHEN EXCLUDED."display_name" IS NULL THEN "users"."display_name" ELSE EXCLUDED."display_name" END, CASE WHEN EXCLUDED."mood" IS NULL THEN "users"."mood" ELSE EXCLUDED."mood" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
          null,
        ],
      }
    `);
  });

  it("reportAction: 'suppress' drops $action", () => {
    expect(db.upsert('users', ada, 'email', { reportAction: 'suppress' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name") RETURNING to_jsonb("users".*) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
        ],
      }
    `);
  });

  it('doNothing: ON CONFLICT ... DO NOTHING', () => {
    expect(db.doNothing).toEqual([]);
    expect(db.upsert('users', ada, 'email', { updateColumns: db.doNothing }).compile()).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO NOTHING RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          "Ada L.",
          "ada@example.com",
        ],
      }
    `);
  });

  it('returning and extras', () => {
    expect(db.upsert('users', ada, 'email', { returning: ['id'], extras: { name: 'display_name' } }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name") RETURNING jsonb_build_object($3::text, "id") || jsonb_build_object($4::text, "display_name") || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "values": [
            "Ada L.",
            "ada@example.com",
            "id",
            "name",
          ],
        }
      `);
  });

  it('an empty array: the no-op insert', () => {
    const q = db.upsert('users', [], 'email');
    expect(q.noop).toBe(true);
    expect(q.compile()).toMatchInlineSnapshot(`
      {
        "text": "/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "users" SELECT null WHERE false",
        "values": [],
      }
    `);
  });
});

describe('upsertRequiresSameKeys', () => {
  afterEach(resetConfig);
  const
    rows = [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ],
    sameKeys = [{ ...rows[0], title: 'Tee' }, rows[1]];

  it('with it, rows with different keys throw before any query', () => {
    db.setConfig({ upsertRequiresSameKeys: true });
    expect(() => db.upsert('products', rows, ['sku', 'variant']))
      .toThrow('rows have different keys: pass updateColumns, or give every row the same keys');
    expect(() => db.upsert('products', rows, ['sku', 'variant'], { updateValues: { price_cents: 1 } }))
      .toThrow('rows have different keys: pass updateColumns, or give every row the same keys');
  });

  it('with it, the same keys, one row, updateColumns or doNothing compile as without it', () => {
    const queries = () => [
      db.upsert('products', sameKeys, ['sku', 'variant']),
      db.upsert('products', rows[0], ['sku', 'variant']),
      db.upsert('products', rows, ['sku', 'variant'], { updateColumns: ['title'] }),
      db.upsert('products', rows, ['sku', 'variant'], { updateColumns: db.doNothing }),
    ].map(q => q.compile());
    const without = queries();
    db.setConfig({ upsertRequiresSameKeys: true });
    expect(queries()).toEqual(without);
    expect(without[2]).toMatchInlineSnapshot(`
      {
        "text": "INSERT INTO "products" ("price_cents", "sku", "title", "variant") VALUES ($1, $2, DEFAULT, $3), ($4, $5, $6, $7) ON CONFLICT ("sku", "variant") DO UPDATE SET ("title") = ROW(EXCLUDED."title") RETURNING to_jsonb("products".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "values": [
          1300,
          "TEE",
          "S",
          900,
          "CAP",
          "Cap",
          "",
        ],
      }
    `);
  });
});

/** A fresh src/db, which has emitted no warning yet, and a spy on the warnings. */
const fresh = async () => {
  vi.resetModules();
  const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
  return { fdb: await import('../../src/db'), emitWarning };
};

describe('upsert of rows with different keys, without upsertRequiresSameKeys', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const rows = [
    { sku: 'TEE', variant: 'S', price_cents: 1300 },
    { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
  ];

  it('emits a DeprecationWarning once per process, PGCAST_DEP001, naming the option', async () => {
    // the SQL is unchanged: see 'several conflict columns and several rows' above
    const { fdb, emitWarning } = await fresh();
    fdb.upsert('products', rows, ['sku', 'variant']);
    fdb.upsert('products', rows, ['sku', 'variant'], { updateValues: { price_cents: 1 } });
    expect(emitWarning).toHaveBeenCalledTimes(1);
    const [message, options] = emitWarning.mock.calls[0];
    expect(options).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP001' });
    expect(message).toMatch(/upsertRequiresSameKeys: true/);
    expect(message).toMatch(/default in pgcast 7\.0/);
  });

  it('emits none for rows with the same keys, one row, updateColumns or doNothing, nor with the option', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.upsert('products', [{ ...rows[0], title: 'Tee' }, rows[1]], ['sku', 'variant']);
    fdb.upsert('products', rows[0], ['sku', 'variant']);
    fdb.upsert('products', rows, ['sku', 'variant'], { updateColumns: ['title'] });
    fdb.upsert('products', rows, ['sku', 'variant'], { updateColumns: fdb.doNothing });
    fdb.setConfig({ upsertRequiresSameKeys: true });
    expect(() => fdb.upsert('products', rows, ['sku', 'variant'])).toThrow();
    expect(emitWarning).not.toHaveBeenCalled();
  });
});

describe('upsert of rows with different keys: only a missing key still set from EXCLUDED counts', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** Whether `call` warns without upsertRequiresSameKeys, and what it throws with it. */
  const outcome = async (call: (fdb: typeof db) => unknown) => {
    const { fdb, emitWarning } = await fresh();
    call(fdb);
    const warns = emitWarning.mock.calls.length > 0;
    fdb.setConfig({ upsertRequiresSameKeys: true });
    try { call(fdb); return { warns, throws: undefined }; }
    catch (err: any) { return { warns, throws: err.message as string }; }
  };
  const none = { warns: false, throws: undefined };
  const both = { warns: true, throws: 'rows have different keys: pass updateColumns, or give every row the same keys' };

  it('new rows without their serial id, conflict target id, among existing rows: neither', async () => {
    // a missing id is inserted as DEFAULT, a new serial value; on conflict, EXCLUDED.id is the existing id
    const rows = [
      { id: 1, sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'NEW', variant: '', price_cents: 900 },
    ];
    expect(await outcome(fdb => fdb.upsert('products', rows, 'id'))).toEqual(none);
    expect(await outcome(fdb => fdb.upsert('products', rows, ['id']))).toEqual(none);
  });

  it('a missing key given in updateValues: neither', async () => {
    // it compiles to ROW(..., $n), never to EXCLUDED."title"
    const rows = [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ];
    expect(await outcome(fdb => fdb.upsert('products', rows, ['sku', 'variant'], { updateValues: { title: 'x' } })))
      .toEqual(none);
  });

  it('a missing key really overwritten from EXCLUDED: both, even with another conflict column missing', async () => {
    const rows = [
      { id: 1, sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ];
    expect(await outcome(fdb => fdb.upsert('products', rows, 'id'))).toEqual(both);
    expect(await outcome(fdb => fdb.upsert('products', rows, 'id', { noNullUpdateColumns: 'title' }))).toEqual(both);
  });

  it('a constraint() target keeps the plain rule: a missing column of the constraint counts', async () => {
    // its columns are not known at compile time
    const rows = [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'MUG', price_cents: 900 },
    ];
    expect(await outcome(fdb => fdb.upsert('products', rows, fdb.constraint('products_sku_variant_key')))).toEqual(both);
    expect(await outcome(fdb => fdb.upsert('products', rows, ['sku', 'variant']))).toEqual(none);
  });
});

describe('update', () => {
  it('one column: SET (...) = ROW(...)', () => {
    expect(db.update('accounts', { balance: 10 }, { id: 1 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "UPDATE "accounts" SET ("balance") = ROW($1) WHERE ("id" = $2) RETURNING to_jsonb("accounts".*) AS result",
        "values": [
          10,
          1,
        ],
      }
    `);
  });

  it('several columns, fragments with self, Default, a fragment as the where clause, returning and extras', () => {
    expect(db.update('accounts', { ratio: Default, balance: dc.add(5), lifetime_ops: sql`${db.self} + 1` },
      sql`${'id'} < ${param(3)}`, { returning: ['id', 'balance'], extras: { ops: 'lifetime_ops' } }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "UPDATE "accounts" SET ("balance", "lifetime_ops", "ratio") = ROW("balance" + $1, "lifetime_ops" + 1, DEFAULT) WHERE "id" < $2 RETURNING jsonb_build_object($3::text, "id", $4::text, "balance") || jsonb_build_object($5::text, "lifetime_ops") AS result",
          "values": [
            5,
            3,
            "id",
            "balance",
            "ops",
          ],
        }
      `);
  });

  it('characterization: no column at all', () => {
    // characterization: `SET () = ROW()` is invalid SQL (see the integration test)
    expect(db.update('accounts', {}, { id: 1 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "UPDATE "accounts" SET () = ROW() WHERE ("id" = $1) RETURNING to_jsonb("accounts".*) AS result",
        "values": [
          1,
        ],
      }
    `);
  });

  it('characterization: an undefined value', () => {
    // characterization: the key is kept and the column set to NULL, not left out
    expect(db.update('users', { mood: 'ok', manager_id: undefined }, { id: 2 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "UPDATE "users" SET ("manager_id", "mood") = ROW($1, $2) WHERE ("id" = $3) RETURNING to_jsonb("users".*) AS result",
        "values": [
          undefined,
          "ok",
          2,
        ],
      }
    `);
  });
});

describe('deletes', () => {
  it('a Whereable, a fragment, returning and extras', () => {
    expect(db.deletes('memberships', { user_id: 2 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "DELETE FROM "memberships" WHERE ("user_id" = $1) RETURNING to_jsonb("memberships".*) AS result",
        "values": [
          2,
        ],
      }
    `);
    expect(db.deletes('memberships', sql`${'role'} <> ${param('owner')}`, { returning: ['user_id'], extras: { r: 'role' } })
      .compile()).toMatchInlineSnapshot(`
        {
          "text": "DELETE FROM "memberships" WHERE "role" <> $1 RETURNING jsonb_build_object($2::text, "user_id") || jsonb_build_object($3::text, "role") AS result",
          "values": [
            "owner",
            "user_id",
            "r",
          ],
        }
      `);
  });
});

describe('truncate', () => {
  it('one table, a list, and the options', () => {
    expect(db.truncate('extra.articles').compile()).toMatchInlineSnapshot(`
      {
        "text": "TRUNCATE "extra"."articles"",
        "values": [],
      }
    `);
    expect(db.truncate(['users', 'accounts'], 'RESTART IDENTITY').compile()).toMatchInlineSnapshot(`
      {
        "text": "TRUNCATE "users", "accounts" RESTART IDENTITY",
        "values": [],
      }
    `);
    expect(db.truncate('users', 'CASCADE').compile()).toMatchInlineSnapshot(`
      {
        "text": "TRUNCATE "users" CASCADE",
        "values": [],
      }
    `);
    expect(db.truncate('users', 'CONTINUE IDENTITY', 'RESTRICT').compile()).toMatchInlineSnapshot(`
      {
        "text": "TRUNCATE "users" CONTINUE IDENTITY RESTRICT",
        "values": [],
      }
    `);
  });

  it('undefined or null options (allowed without strictNullChecks) give the SQL of 6.6.1, spaces and all', () => {
    expect(db.truncate('users', undefined as any).compile().text).toBe('TRUNCATE "users" ');
    expect(db.truncate('users', null as any).compile().text).toBe('TRUNCATE "users" ');
    expect(db.truncate('users', undefined as any, 'CASCADE').compile().text).toBe('TRUNCATE "users"  CASCADE');
    expect(db.truncate('users', 'RESTART IDENTITY', undefined as any).compile().text).toBe('TRUNCATE "users" RESTART IDENTITY ');
    expect(() => db.truncate('users', '' as any)).toThrow(`Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not ''`);
  });
});

describe('select', () => {
  it('all rows, or a Whereable: rows aggregated with jsonb_agg in a sub-select', () => {
    expect(db.select('users', all).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "values": [],
      }
    `);
    expect(db.select('users', { mood: 'ok' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" WHERE ("mood" = $1)) AS "sq_users"",
        "values": [
          "ok",
        ],
      }
    `);
  });

  it('distinct: true, a column, a list, a fragment, false', () => {
    expect(db.select('users', all, { distinct: true }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
    expect(db.select('users', all, { distinct: 'mood' }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("mood") to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
    expect(db.select('users', all, { distinct: ['mood', 'manager_id'] }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("mood", "manager_id") to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
    expect(db.select('users', all, { distinct: sql`lower(${'display_name'})` }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON (lower("display_name")) to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
    expect(db.select('users', all, { distinct: false }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
  });

  it('order: one spec, a list, nulls, a fragment', () => {
    expect(db.select('users', all, { order: { by: 'id', direction: 'DESC' } }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "id" DESC) AS "sq_users""`);
    expect(db.select('users', all, {
      order: [{ by: 'mood', direction: 'ASC', nulls: 'LAST' }, { by: sql`lower(${'display_name'})`, direction: 'DESC', nulls: 'FIRST' }],
    }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "mood" ASC NULLS LAST, lower("display_name") DESC NULLS FIRST) AS "sq_users""`);
  });

  it('order: a bad direction or nulls throws', () => {
    expect(() => db.select('users', all, { order: { by: 'id', direction: 'UP' as any } }).compile())
      .toThrowErrorMatchingInlineSnapshot(`[Error: Direction must be ASC/DESC, not 'UP']`);
    expect(() => db.select('users', all, { order: { by: 'id', direction: 'ASC', nulls: 'NEVER' as any } }).compile())
      .toThrowErrorMatchingInlineSnapshot(`[Error: Nulls must be FIRST/LAST/undefined, not 'NEVER']`);
  });

  it('limit, offset, withTies', () => {
    expect(db.select('users', all, { limit: 2, offset: 1 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $1 OFFSET $2) AS "sq_users"",
        "values": [
          2,
          1,
        ],
      }
    `);
    expect(db.select('users', all, { order: { by: 'mood', direction: 'ASC' }, limit: 1, withTies: true, offset: 0 }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "mood" ASC FETCH FIRST $1 ROWS WITH TIES OFFSET $2) AS "sq_users"",
          "values": [
            1,
            0,
          ],
        }
      `);
    // characterization: withTies without limit is ignored
    expect(db.select('users', all, { withTies: true }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users") AS "sq_users""`);
  });

  it('columns and extras', () => {
    expect(db.select('users', all, {
      columns: ['id', 'display_name'],
      extras: { reports: sql`(SELECT count(*) FROM ${'users'} AS "r" WHERE "r".${'manager_id'} = ${'users'}.${'id'})`, mail: 'email' },
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "id", $2::text, "display_name") || jsonb_build_object($3::text, (SELECT count(*) FROM "users" AS "r" WHERE "r"."manager_id" = "users"."id"), $4::text, "email") AS result FROM "users") AS "sq_users"",
        "values": [
          "id",
          "display_name",
          "reports",
          "mail",
        ],
      }
    `);
  });

  it('groupBy (column, list, fragment) and having (Whereable, fragment)', () => {
    expect(db.select('accounts', all, {
      columns: ['owner_id'], extras: { n: sql`count(*)` }, groupBy: 'owner_id', having: sql`count(*) > ${param(1)}`,
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "owner_id") || jsonb_build_object($2::text, count(*)) AS result FROM "accounts" GROUP BY "owner_id" HAVING count(*) > $3) AS "sq_accounts"",
        "values": [
          "owner_id",
          "n",
          1,
        ],
      }
    `);
    expect(db.select('accounts', all, { groupBy: ['owner_id', 'id'], having: { owner_id: 1 } }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("accounts".*) AS result FROM "accounts" GROUP BY "owner_id", "id" HAVING ("owner_id" = $1)) AS "sq_accounts"",
          "values": [
            1,
          ],
        }
      `);
    expect(db.select('accounts', all, { groupBy: sql`${'owner_id'}` }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("accounts".*) AS result FROM "accounts" GROUP BY "owner_id") AS "sq_accounts""`);
  });

  it('lateral as an object: one LEFT JOIN LATERAL per key, keys sorted', () => {
    expect(db.select('users', all, {
      lateral: {
        accounts: db.select('accounts', { owner_id: parent('id') }),
        accountCount: db.count('accounts', { owner_id: parent('id') }),
      },
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_accountCount".result, $2::text, "lateral_accounts".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_accountCount" ON true LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "sq_accounts") AS "lateral_accounts" ON true) AS "sq_users"",
        "values": [
          "accountCount",
          "accounts",
        ],
      }
    `);
  });

  it('lateral as a passthru fragment', () => {
    expect(db.select('users', all, { lateral: db.count('accounts', { owner_id: parent('id') }) }).compile())
      .toMatchInlineSnapshot(`
        {
          "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT "lateral_passthru".result AS result FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_passthru" ON true) AS "sq_users"",
          "values": [],
        }
      `);
  });

  it('lateral nested, with alias for a self-join', () => {
    expect(db.select('users', { id: 1 }, {
      alias: 'u',
      lateral: {
        reports: db.select('users', { manager_id: parent('id') }, {
          alias: 'r',
          lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['id'] }) },
        }),
      },
    }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("u".*) || jsonb_build_object($1::text, "lateral_reports".result) AS result FROM "users" AS "u" LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("r".*) || jsonb_build_object($2::text, "lateral_accounts".result) AS result FROM "users" AS "r" LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($3::text, "id") AS result FROM "accounts" WHERE ("owner_id" = "r"."id")) AS "sq_accounts") AS "lateral_accounts" ON true WHERE ("manager_id" = "u"."id")) AS "sq_r") AS "lateral_reports" ON true WHERE ("id" = $4)) AS "sq_u"",
        "values": [
          "reports",
          "accounts",
          "id",
          1,
        ],
      }
    `);
  });

  it('lock: one, a list, of, wait', () => {
    expect(db.select('users', all, { lock: { for: 'UPDATE' } }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE) AS "sq_users""`);
    expect(db.select('users', all, { alias: 'u', lock: [
      { for: 'NO KEY UPDATE', of: 'u', wait: 'NOWAIT' },
      { for: 'SHARE', of: ['u'], wait: 'SKIP LOCKED' },
      { for: 'KEY SHARE' },
    ] }).compile().text).toMatchInlineSnapshot(`"SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("u".*) AS result FROM "users" AS "u" FOR NO KEY UPDATE OF "u" NOWAIT FOR SHARE OF "u" SKIP LOCKED FOR KEY SHARE) AS "sq_u""`);
  });
});

describe('selectOne, selectExactlyOne', () => {
  it('LIMIT 1 as a parameter, no jsonb_agg', () => {
    expect(db.selectOne('users', { id: 1 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT to_jsonb("users".*) AS result FROM "users" WHERE ("id" = $1) LIMIT $2",
        "values": [
          1,
          1,
        ],
      }
    `);
    expect(db.selectExactlyOne('users', { id: 1 }, { columns: ['id'] }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT jsonb_build_object($1::text, "id") AS result FROM "users" WHERE ("id" = $2) LIMIT $3",
        "values": [
          "id",
          1,
          1,
        ],
      }
    `);
  });

  it('characterization: the limit option is overridden', () => {
    expect(db.selectOne('users', all, { limit: 5 }).compile().values).toEqual([1]);
  });
});

describe('count, sum, avg, min, max', () => {
  it('without columns: aggregate(*)', () => {
    expect(db.count('users', all).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT count(*) AS result FROM "users"",
        "values": [],
      }
    `);
    expect(db.sum('accounts', { owner_id: 1 }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT sum(*) AS result FROM "accounts" WHERE ("owner_id" = $1)",
        "values": [
          1,
        ],
      }
    `);
  });

  it('with columns: aggregate("col"), extras ignored', () => {
    expect(db.count('users', all, { columns: ['manager_id'], extras: { x: sql`1` } }).compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT count("manager_id") AS result FROM "users"",
        "values": [],
      }
    `);
    expect(db.sum('accounts', all, { columns: ['balance'] }).compile().text).toMatchInlineSnapshot(`"SELECT sum("balance") AS result FROM "accounts""`);
    expect(db.avg('accounts', all, { columns: ['balance'] }).compile().text).toMatchInlineSnapshot(`"SELECT avg("balance") AS result FROM "accounts""`);
    expect(db.min('events', all, { columns: ['occurred_on'] }).compile().text).toMatchInlineSnapshot(`"SELECT min("occurred_on") AS result FROM "events""`);
    expect(db.max('users', all, { columns: ['display_name'] }).compile().text).toMatchInlineSnapshot(`"SELECT max("display_name") AS result FROM "users""`);
  });

  it('characterization: several columns are passed to the aggregate as several arguments', () => {
    expect(db.count('users', all, { columns: ['id', 'mood'] }).compile().text).toMatchInlineSnapshot(`"SELECT count("id", "mood") AS result FROM "users""`);
  });

  it('characterization: a passthru lateral leaves no column to aggregate', () => {
    // characterization: `SELECT  AS result`, invalid SQL (see the integration test)
    expect(db.count('users', all, { lateral: db.count('accounts', { owner_id: parent('id') }) }).compile().text)
      .toMatchInlineSnapshot(`"SELECT  AS result FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_passthru" ON true"`);
  });
});
