// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/core.ts, compilation only (no database): the
// `text` + `values` of each branch of compileExpression, as Zapatos 6.6.1
// produces them. Execution: test/integration/core.test.ts.
// Hostile inputs are the subject of step 1.4 (test/unit/injection.test.ts).

import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, raw, cols, vals, parent, self, Default } from '../../src/db';
import { resetConfig } from '../helpers/config';

/** Compiles one interpolated expression on its own. */
const one = (expression: db.SQL) => sql`${expression}`.compile();

/** What calling `f` throws, or 'compiled'. */
const thrown = (f: () => unknown) => {
  try { f(); return 'compiled'; } catch (err) { return (err as Error).message; }
};

afterEach(resetConfig);

describe('identifiers (strings)', () => {
  it('quotes a simple identifier', () => {
    expect(one('users')).toMatchInlineSnapshot(`
      {
        "text": ""users"",
        "values": [],
      }
    `);
  });

  it('passes an already quoted identifier through unchanged', () => {
    expect(one('"OrderLines"')).toMatchInlineSnapshot(`
      {
        "text": ""OrderLines"",
        "values": [],
      }
    `);
  });

  it('splits a dotted identifier on every dot', () => {
    expect(one('public.users')).toMatchInlineSnapshot(`
      {
        "text": ""public"."users"",
        "values": [],
      }
    `);
    expect(one('a.b.c')).toMatchInlineSnapshot(`
      {
        "text": ""a"."b"."c"",
        "values": [],
      }
    `);
  });

  it('doubles an embedded double quote', () => {
    // as quote_ident: `a"b` compiles to `"a""b"`, not `"a"b"` as in 6.6.1 (injection matrix: test/unit/injection.test.ts)
    expect(one('a"b')).toMatchInlineSnapshot(`
      {
        "text": ""a""b"",
        "values": [],
      }
    `);
    expect(one('s.a"b')).toEqual({ text: '"s"."a""b"', values: [] });
  });

  it('writes a string as before if 6.6.1 compiled it to quoted identifiers only', () => {
    // a hand-escaped `a""b` named the column `a"b` under 6.6.1, and still does
    expect(one('a""b')).toEqual({ text: '"a""b"', values: [] });
    expect(one('s.a""b')).toEqual({ text: '"s"."a""b"', values: [] });
    expect(one('a"."b')).toEqual({ text: '"a"".""b"', values: [] });
  });

  it('writes a string that is already a well-formed quoted name as is', () => {
    // `"; DROP TABLE t; --"` is one quoted name too, the column `; DROP TABLE t; --`, as under 6.6.1
    for (const name of ['"a"', '"a"."b"', '"a""b"', '"a.b"', '"a" . "b"', '"a"\n.\n"b"', '"s"."t"."c"', '"; DROP TABLE t; --"'])
      expect(one(name), name).toEqual({ text: name, values: [] });
    // after the first part, a part may also be unquoted or `U&` quoted, as Postgres lexes it
    for (const name of ['"s".t."c"', '"s" . t . "c"', '"s".a$1.é."c"', '"t".U&"c"', '"t".u&"c"', '"s".t.U&"c"', '"t".U&"\\0063"'])
      expect(one(name), name).toEqual({ text: name, values: [] });
  });

  it('quotes any other string that starts and ends with a double quote like any other name', () => {
    // 6.6.1 wrote each of these as is, as it did anything that started and ended with `"`
    expect(one('"a" FROM t; DROP TABLE t; SELECT "a"')).toEqual({ text: '"""a"" FROM t; DROP TABLE t; SELECT ""a"""', values: [] });
    expect(one('"a" || "b"')).toEqual({ text: '"""a"" || ""b"""', values: [] });
    expect(one('"a"/**/."b"')).toEqual({ text: '"""a""/**/"."""b"""', values: [] });
    // a `UESCAPE` clause, a space after `U&` (`U & "b"`, an expression) or an unquoted part that is not an identifier
    expect(one(`"t".U&"c" UESCAPE '!' || "d"`)).toEqual({ text: `"""t"""."U&""c"" UESCAPE '!' || ""d"""`, values: [] });
    expect(one('"t".U& "c"')).toEqual({ text: '"""t"""."U& ""c"""', values: [] });
    expect(one('"t".$1."c"')).toEqual({ text: '"""t"""."$1"."""c"""', values: [] });
    expect(one('"')).toEqual({ text: '""""', values: [] });
    // as for `a""b`, a name that compiles to quoted names only is written so: `""` gives the column `"`
    expect(one('""')).toEqual({ text: '""""', values: [] });
  });
});

describe('raw and arrays', () => {
  it('inlines a raw string as is', () => {
    expect(one(raw('now() - interval \'1 day\''))).toMatchInlineSnapshot(`
      {
        "text": "now() - interval '1 day'",
        "values": [],
      }
    `);
  });

  it('compiles the elements of an array one after the other, with no separator', () => {
    expect(one(['users', raw(' / '), param(1), sql` + ${param(2)}`])).toMatchInlineSnapshot(`
      {
        "text": ""users" / $1 + $2",
        "values": [
          1,
          2,
        ],
      }
    `);
  });

  it('compiles an empty array to nothing', () => {
    expect(sql`SELECT 1${[]}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "SELECT 1",
        "values": [],
      }
    `);
  });
});

describe('param', () => {
  it('numbers the placeholders from $1, across nested fragments', () => {
    expect(sql`${param('a')}, ${sql`${param('b')}, ${param('c')}`}, ${param('d')}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "$1, $2, $3, $4",
        "values": [
          "a",
          "b",
          "c",
          "d",
        ],
      }
    `);
  });

  it('without a cast: a plain placeholder, the value untouched (arrays and objects included)', () => {
    const date = new Date(0);
    expect(sql`${param(1)}, ${param(null)}, ${param(undefined)}, ${param([1, 2])}, ${param({ a: 1 })}, ${param(date)}`.compile())
      .toMatchInlineSnapshot(`
        {
          "text": "$1, $2, $3, $4, $5, $6",
          "values": [
            1,
            null,
            undefined,
            [
              1,
              2,
            ],
            {
              "a": 1,
            },
            1970-01-01T00:00:00.000Z,
          ],
        }
      `);
  });

  it('with a text cast: CAST($n AS "type"), each part of the type quoted, its array bounds after it', () => {
    expect(one(param('2026-01-01', 'date'))).toMatchInlineSnapshot(`
      {
        "text": "CAST($1 AS "date")",
        "values": [
          "2026-01-01",
        ],
      }
    `);
    expect(one(param('ok', 'public.mood'))).toEqual({ text: 'CAST($1 AS "public"."mood")', values: ['ok'] });
    expect(one(param([1], 'int4[]'))).toEqual({ text: 'CAST($1 AS "int4"[])', values: [[1]] });
    expect(one(param([[1]], 'int4[3][]'))).toEqual({ text: 'CAST($1 AS "int4"[3][])', values: [[[1]]] });
    expect(one(param(['ok'], 'public.mood[]'))).toEqual({ text: 'CAST($1 AS "public"."mood"[])', values: [['ok']] });
    expect(one(param([1], 'pg_catalog"."int4[]'))).toEqual({ text: 'CAST($1 AS "pg_catalog"."int4"[])', values: [[1]] });
    // a type already quoted is written as is, so a name that holds a `.` stays reachable
    expect(one(param('ok', '"public"."mood"'))).toEqual({ text: 'CAST($1 AS "public"."mood")', values: ['ok'] });
    expect(one(param('x', '"a.b"'))).toEqual({ text: 'CAST($1 AS "a.b")', values: ['x'] });
    // no part is written unquoted, so the grammar's aliases are not types: `"int"` does not exist, `"char"` is not char(1)
    expect(one(param([1], 'int[]'))).toEqual({ text: 'CAST($1 AS "int"[])', values: [[1]] });
    expect(one(param('x', 'char'))).toEqual({ text: 'CAST($1 AS "char")', values: ['x'] });
  });

  it('with a text cast outside that grammar: one quoted identifier, its bounds after it only as `[]` or `[n]`', () => {
    const text = (cast: string) => one(param(1, cast)).text;
    expect(text('double precision')).toBe('CAST($1 AS "double precision")');
    expect(text('timestamp with time zone')).toBe('CAST($1 AS "timestamp with time zone")');
    expect(text('varchar(10)')).toBe('CAST($1 AS "varchar(10)")');
    expect(text('int4 ARRAY')).toBe('CAST($1 AS "int4 ARRAY")');
    expect(text('int4 []')).toBe('CAST($1 AS "int4 "[])');
    expect(text('int4[ ]')).toBe('CAST($1 AS "int4[ ]")');
    expect(text('int4[-1]')).toBe('CAST($1 AS "int4[-1]")');
    expect(text('int4[0x10]')).toBe('CAST($1 AS "int4[0x10]")');
    expect(text('int4[[]]')).toBe('CAST($1 AS "int4[[]]")');
    expect(text('int4[]x')).toBe('CAST($1 AS "int4[]x")');
  });

  it('with a text cast that is well-formed once quoted: written as is, as in 6.6.1', () => {
    expect(one(param('1', 'pg_catalog"."int4'))).toEqual({ text: 'CAST($1 AS "pg_catalog"."int4")', values: ['1'] });
    // with a `"`, `.` does not split: the cast is one name, `"` doubled, unless it is well-formed as above
    expect(one(param('1', 's.a"b'))).toEqual({ text: 'CAST($1 AS "s.a""b")', values: ['1'] });
  });

  it('with true: arrays and plain objects are JSON-stringified and cast to json', () => {
    expect(sql`${param([1, 'a'], true)}, ${param({ a: [1] }, true)}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "CAST($1 AS "json"), CAST($2 AS "json")",
        "values": [
          "[1,"a"]",
          "{"a":[1]}",
        ],
      }
    `);
  });

  it('characterization: with true, a scalar or a non-plain object is neither stringified nor cast', () => {
    // characterization: cast `true` only acts on arrays and POJOs; anything else is a plain placeholder
    expect(sql`${param('a', true)}, ${param(1, true)}, ${param(new Date(0), true)}, ${param(null, true)}`.compile())
      .toMatchInlineSnapshot(`
        {
          "text": "$1, $2, $3, $4",
          "values": [
            "a",
            1,
            1970-01-01T00:00:00.000Z,
            null,
          ],
        }
      `);
  });

  it('with false: never JSON, whatever the config', () => {
    db.setConfig({ castArrayParamsToJson: true, castObjectParamsToJson: true });
    expect(sql`${param([1], false)}, ${param({ a: 1 }, false)}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "$1, $2",
        "values": [
          [
            1,
          ],
          {
            "a": 1,
          },
        ],
      }
    `);
  });

  it('castArrayParamsToJson: arrays only', () => {
    db.setConfig({ castArrayParamsToJson: true });
    expect(sql`${param([1, 2])}, ${param({ a: 1 })}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "CAST($1 AS "json"), $2",
        "values": [
          "[1,2]",
          {
            "a": 1,
          },
        ],
      }
    `);
  });

  it('castObjectParamsToJson: plain objects only', () => {
    db.setConfig({ castObjectParamsToJson: true });
    expect(sql`${param([1, 2])}, ${param({ a: 1 })}, ${param(new Date(0))}`.compile()).toMatchInlineSnapshot(`
      {
        "text": "$1, CAST($2 AS "json"), $3",
        "values": [
          [
            1,
            2,
          ],
          "{"a":1}",
          1970-01-01T00:00:00.000Z,
        ],
      }
    `);
  });

  it('characterization: a JSON cast wins over a text cast when the config asks for it', () => {
    // characterization: with castArrayParamsToJson, param(array, 'int4[]') compiles to CAST($1 AS "json")
    db.setConfig({ castArrayParamsToJson: true });
    expect(one(param([1, 2], 'int4[]'))).toMatchInlineSnapshot(`
      {
        "text": "CAST($1 AS "json")",
        "values": [
          "[1,2]",
        ],
      }
    `);
  });
});

describe('Default, self, parent', () => {
  it('Default compiles to DEFAULT', () => {
    expect(one(Default)).toMatchInlineSnapshot(`
      {
        "text": "DEFAULT",
        "values": [],
      }
    `);
  });

  it('self compiles to the current column of a Whereable', () => {
    expect(one({ display_name: sql`lower(${self}) = ${param('ada')}` })).toMatchInlineSnapshot(`
      {
        "text": "((lower("display_name") = $1))",
        "values": [
          "ada",
        ],
      }
    `);
  });

  it('parent(column) and parent() compile against the parent table of a nested query', () => {
    const nested = sql`${{ owner_id: parent('id') }} AND ${{ id: parent() }}`.copy({ parentTable: 'users' });
    expect(nested.compile()).toMatchInlineSnapshot(`
      {
        "text": "("owner_id" = "users"."id") AND ("id" = "users"."id")",
        "values": [],
      }
    `);
  });

  it('parent() inside a fragment of a Whereable takes the current column', () => {
    const nested = sql`${{ manager_id: sql`${self} = ${parent()}` }}`.copy({ parentTable: 'users' });
    expect(nested.compile()).toMatchInlineSnapshot(`
      {
        "text": "(("manager_id" = "users"."manager_id"))",
        "values": [],
      }
    `);
  });
});

describe('cols and vals', () => {
  it('cols of an array: quoted names, in array order', () => {
    expect(one(cols(['email', 'display_name', 'public.users']))).toMatchInlineSnapshot(`
      {
        "text": ""email", "display_name", "public"."users"",
        "values": [],
      }
    `);
  });

  it('cols of an object: its keys, sorted', () => {
    expect(one(cols({ zeta: 1, alpha: 2, Mid: 3 }))).toMatchInlineSnapshot(`
      {
        "text": ""Mid", "alpha", "zeta"",
        "values": [],
      }
    `);
  });

  it('vals of an object: values in the sorted key order; SQLFragment, Parameter and Default kept', () => {
    const values = { zeta: 1, alpha: sql`now()`, mid: param('x', 'text'), beta: Default, gamma: sql`${self} + 1` };
    expect(sql`(${cols(values)}) = (${vals(values)})`.compile()).toMatchInlineSnapshot(`
      {
        "text": "("alpha", "beta", "gamma", "mid", "zeta") = (now(), DEFAULT, "gamma" + 1, CAST($1 AS "text"), $2)",
        "values": [
          "x",
          1,
        ],
      }
    `);
  });

  it('vals of an array: plain values become parameters, SQLFragments are kept', () => {
    expect(one(vals([1, 'a', sql`now()`, null]))).toMatchInlineSnapshot(`
      {
        "text": "$1, $2, now(), $3",
        "values": [
          1,
          "a",
          null,
        ],
      }
    `);
  });

  it('vals of an array compiles a Parameter as it is, and Default as DEFAULT', () => {
    // as vals of an object does; 6.6.1 wrapped both in another parameter, sent as '{"value":1}' and 'Symbol(DEFAULT)'
    expect(one(vals([param(1), param('a', 'text'), Default, 2]))).toMatchInlineSnapshot(`
      {
        "text": "$1, CAST($2 AS "text"), DEFAULT, $3",
        "values": [
          1,
          "a",
          2,
        ],
      }
    `);
  });

  it('vals of an array throws on Default in a Whereable: a filter has no default', () => {
    expect(() => one({ id: db.conditions.isIn([1, Default]) })).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.]`);
  });

  it('vals of an array throws on raw, cols and vals in a Whereable: they are no values', () => {
    // 6.6.1 sent them as JSON ('{"value":"1"}'): no row on a text column, every row with isNotIn, 22P02 on the
    // others; so does vals([…]) in a fragment value of vals of an object, as for Default
    expect(new Set([raw('1'), cols('x'), vals('x')].flatMap(value => [
      () => sql`${{ owner_id: db.conditions.isIn([1, value]) }}`.copy({ parentTable: 'users' }).compile(),
      () => one({ owner_id: db.conditions.isNotIn([value]) }),
      () => one(vals({ role: sql`${vals([value])}` })),
    ].map(thrown)))).toMatchInlineSnapshot(`
      Set {
        "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: to compare with SQL, use a \`sql\` fragment value, where \`db.self\` stands for the column; to compare with a value, give the value itself, or \`db.param()\`.",
      }
    `);
  });

  it('characterization: outside a filter, raw, cols and vals in vals of an array are parameters', () => {
    // characterization: pg sends them as JSON ('{"value":"now()"}'); left as they are by #108
    expect(one(vals([raw('now()'), cols(['a']), vals([1])]))).toMatchInlineSnapshot(`
      {
        "text": "$1, $2, $3",
        "values": [
          DangerousRawString {
            "value": "now()",
          },
          ColumnNames {
            "value": [
              "a",
            ],
          },
          ColumnValues {
            "value": [
              1,
            ],
          },
        ],
      }
    `);
  });

  it('vals of an array compiles parent() as the parent column, as a Whereable value does', () => {
    // 6.6.1 wrapped it in a parameter, sent as '{"value":"id"}' (#107); parent() takes the column of the filter
    const c = db.conditions;
    const nested = sql`${{ owner_id: c.isIn([parent('id'), 2]), id: c.isNotIn([parent()]), manager_id: sql`${self} IN (${vals([parent('id')])})` }}`;
    expect(nested.copy({ parentTable: 'users' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "(("id" NOT IN ("users"."id")) AND ("manager_id" IN ("users"."id")) AND ("owner_id" IN ("users"."id", $1)))",
        "values": [
          2,
        ],
      }
    `);
    expect(sql`${vals([1, parent('id')])}`.copy({ parentTable: 'users' }).compile()).toMatchInlineSnapshot(`
      {
        "text": "$1, "users"."id"",
        "values": [
          1,
        ],
      }
    `);
  });

  it('vals of an array throws on self in a Whereable: self is the column, not a value', () => {
    // 6.6.1 sent 'Symbol(self)'; so does vals([self]) in a fragment value of vals of an object, as for Default
    expect(() => one({ display_name: db.conditions.isIn(['Ada', self]) })).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.]`);
    expect(() => one(vals({ role: sql`${vals([self])}` }))).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.]`);
  });

  it('characterization: outside a filter, vals([self]), vals({ a: self }), param(self) and param(Default) are parameters', () => {
    // characterization: pg sends 'Symbol(self)' and 'Symbol(DEFAULT)'; left as they are by #106
    expect({
      vals: one(vals([self])), valsObject: one(vals({ a: self })), param: one(param(self)), paramDefault: one(param(Default)),
    }).toMatchInlineSnapshot(`
      {
        "param": {
          "text": "$1",
          "values": [
            Symbol(self),
          ],
        },
        "paramDefault": {
          "text": "$1",
          "values": [
            Symbol(DEFAULT),
          ],
        },
        "vals": {
          "text": "$1",
          "values": [
            Symbol(self),
          ],
        },
        "valsObject": {
          "text": "$1",
          "values": [
            Symbol(self),
          ],
        },
      }
    `);
  });

  it('vals of an array throws on Default in a fragment value of vals of an object, which reads as a Whereable', () => {
    // the fragment is compiled with its key as the current column, as in a Whereable; 6.6.1 sent 'Symbol(DEFAULT)'
    expect(() => one(vals({ role: sql`${vals([Default])}` }))).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.]`);
  });
});

describe('Whereable', () => {
  it('an empty Whereable compiles to TRUE', () => {
    expect(one({})).toMatchInlineSnapshot(`
      {
        "text": "TRUE",
        "values": [],
      }
    `);
  });

  it('keys sorted, joined by AND, values as parameters', () => {
    expect(one({ mood: 'ok', display_name: 'Bob', id: 2 })).toMatchInlineSnapshot(`
      {
        "text": "("display_name" = $1 AND "id" = $2 AND "mood" = $3)",
        "values": [
          "Bob",
          2,
          "ok",
        ],
      }
    `);
  });

  it('a fragment value is wrapped in parentheses, with self bound to the key', () => {
    expect(one({ id: sql`${self} > ${param(1)}`, display_name: 'Bob' })).toMatchInlineSnapshot(`
      {
        "text": "("display_name" = $1 AND ("id" > $2))",
        "values": [
          "Bob",
          1,
        ],
      }
    `);
  });

  it('characterization: null and undefined values compile to `= $n`', () => {
    // characterization: `{ col: null }` or `{ col: undefined }` gives `"col" = NULL`, which matches no row
    expect(one({ manager_id: null, mood: undefined })).toMatchInlineSnapshot(`
      {
        "text": "("manager_id" = $1 AND "mood" = $2)",
        "values": [
          null,
          undefined,
        ],
      }
    `);
  });

  it('a Parameter value compiles as it is, with its cast', () => {
    // 6.6.1 wrapped it in another parameter, sent as '{"value":1}'
    expect(one({ id: param(1), display_name: param('Ada', 'text'), settings: param({ theme: 'dark' }, true) })).toMatchInlineSnapshot(`
      {
        "text": "("display_name" = CAST($1 AS "text") AND "id" = $2 AND "settings" = CAST($3 AS "json"))",
        "values": [
          "Ada",
          1,
          "{"theme":"dark"}",
        ],
      }
    `);
  });

  it('a Parameter value follows castObjectParamsToJson, and is compiled once', () => {
    // param(param(x)) stays one parameter whose value is the inner Parameter, as in sql`${param(param(x))}`;
    // an array holding a Parameter is one value, as before
    db.setConfig({ castObjectParamsToJson: true });
    expect(one({ settings: param({ theme: 'dark' }), display_name: param(param('Ada')), tags: [param('a')] })).toMatchInlineSnapshot(`
      {
        "text": "("display_name" = $1 AND "settings" = CAST($2 AS "json") AND "tags" = $3)",
        "values": [
          Parameter {
            "cast": undefined,
            "value": "Ada",
          },
          "{"theme":"dark"}",
          [
            Parameter {
              "cast": undefined,
              "value": "a",
            },
          ],
        ],
      }
    `);
  });

  it('a Default value throws: a filter has no default', () => {
    // 6.6.1 sent 'Symbol(DEFAULT)', which matched no row
    expect(() => one({ display_name: Default })).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.]`);
  });

  it('a raw, cols or vals value throws: compare with a sql fragment value, or with a value', () => {
    // 6.6.1 sent them as JSON ('{"value":"\'ok\'"}'): no row on a text or jsonb column, every row with isNotIn,
    // 22P02 on the others; raw(x) is not compiled as SQL there, where it was a parameter, so raw(input) stays harmless
    expect(new Set([raw("'ok'"), cols('Ada'), vals(['admin'])].flatMap(value => [
      () => one({ mood: value }),
      () => one({ id: 1, mood: value }),
      () => one(db.conditions.and({ mood: value })),
      () => one(db.conditions.not({ mood: value })),
      () => sql`${{ owner_id: value }}`.copy({ parentTable: 'users' }).compile(),
    ].map(thrown)))).toMatchInlineSnapshot(`
      Set {
        "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: to compare with SQL, use a \`sql\` fragment value, where \`db.self\` stands for the column; to compare with a value, give the value itself, or \`db.param()\`.",
      }
    `);
  });

  it('raw in a fragment value is SQL, and a plain { value } object is a value', () => {
    expect({ fragment: one({ mood: sql`${self} = ${raw("'ok'")}` }), plain: one({ settings: { value: 'Ada' } }) }).toMatchInlineSnapshot(`
      {
        "fragment": {
          "text": "(("mood" = 'ok'))",
          "values": [],
        },
        "plain": {
          "text": "("settings" = $1)",
          "values": [
            {
              "value": "Ada",
            },
          ],
        },
      }
    `);
  });

  it('a self value throws: self is the column, not a value to compare it with', () => {
    // 6.6.1 sent 'Symbol(self)': no row on a text column, 22P02 on the others
    expect(() => one({ display_name: self })).toThrowErrorMatchingInlineSnapshot(`[Error: \`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.]`);
  });

  it('self in a fragment value is the column, as before', () => {
    expect(one({ display_name: sql`${self} = ${self}`, id: sql`${self} > 0` })).toMatchInlineSnapshot(`
      {
        "text": "(("display_name" = "display_name") AND ("id" > 0))",
        "values": [],
      }
    `);
  });
});

describe('errors', () => {
  it('refuses the global object (`self` instead of `db.self`)', () => {
    expect(() => one(globalThis as any)).toThrowErrorMatchingInlineSnapshot(`[Error: Did you use \`self\` (the global object) where you meant \`db.self\` (the Zapatos value)? The global object cannot be embedded in a query.]`);
  });

  it('refuses an alien value', () => {
    expect(() => one(42 as any)).toThrowErrorMatchingInlineSnapshot(`[Error: Alien object while interpolating SQL: 42]`);
    expect(() => one(true as any)).toThrowErrorMatchingInlineSnapshot(`[Error: Alien object while interpolating SQL: true]`);
    expect(() => one(undefined as any)).toThrowErrorMatchingInlineSnapshot(`[Error: Alien object while interpolating SQL: undefined]`);
  });

  it('characterization: null reaches the Whereable branch and throws a TypeError', () => {
    // characterization: typeof null === 'object', then Object.keys(null) throws, not the alien-object error
    expect(() => one(null as any)).toThrowErrorMatchingInlineSnapshot(`[TypeError: Cannot convert undefined or null to object]`);
  });

  it('refuses self outside a Whereable', () => {
    expect(() => one(self)).toThrowErrorMatchingInlineSnapshot(`[Error: The 'self' column alias has no meaning here]`);
  });

  it('refuses parent outside a nested query', () => {
    expect(() => one(parent('id'))).toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
  });

  it('refuses parent in vals of an array outside a nested query, in a filter or not', () => {
    // 6.6.1 sent '{"value":"id"}' (#107)
    expect(() => one({ id: db.conditions.isIn([parent('id')]) })).toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
    expect(() => one({ id: db.conditions.isNotIn([1, parent()]) })).toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
    expect(() => one(vals([1, parent('id')]))).toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
  });

  it('characterization: parent() with no column and no current column', () => {
    // characterization: the table and the dot are written before the alien `undefined` throws
    const q = sql`${parent()}`.copy({ parentTable: 'users' });
    expect(() => q.compile()).toThrowErrorMatchingInlineSnapshot(`[Error: Alien object while interpolating SQL: undefined]`);
  });
});

describe('SQLFragment', () => {
  it('prepared(): a generated name by default, or the given one; mutates and returns the fragment', () => {
    const q = sql`SELECT 1`;
    expect(q.prepared()).toBe(q);
    expect(q.compile().name).toMatch(/^_zapatos_prepared_\d+$/);
    expect(sql`SELECT 1`.prepared('mine').compile()).toMatchInlineSnapshot(`
      {
        "name": "mine",
        "text": "SELECT 1",
        "values": [],
      }
    `);
  });

  it('noop: a comment is prepended to the text', () => {
    const q = sql`SELECT 1`;
    q.noop = true;
    expect(q.compile()).toMatchInlineSnapshot(`
      {
        "text": "/* marked no-op: won't hit DB unless forced -> */ SELECT 1",
        "values": [],
      }
    `);
  });

  it('copy(): keeps literals, expressions and flags unless overridden', () => {
    const q = sql`SELECT ${param(1)}`.prepared('p');
    q.noop = true;
    expect(q.copy().compile()).toEqual(q.compile());
    expect(q.copy({ noop: false, preparedName: 'other' }).compile()).toMatchInlineSnapshot(`
      {
        "name": "other",
        "text": "SELECT $1",
        "values": [
          1,
        ],
      }
    `);
  });

  it('compile() appends to the result it is given', () => {
    const result = { text: 'x = $1 AND ', values: ['before'] };
    expect(sql`y = ${param('after')}`.compile(result)).toBe(result);
    expect(result).toMatchInlineSnapshot(`
      {
        "text": "x = $1 AND y = $2",
        "values": [
          "before",
          "after",
        ],
      }
    `);
  });
});
