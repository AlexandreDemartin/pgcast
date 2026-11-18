// Copyright (C) 2026 Alexandre Demartin
//
// The parse table (README § What it reads): each value read through pg and through the adapter, by the simple
// protocol (no value) and the extended one (a value), gives the same value, class and type.

import { beforeAll, describe, expect, it } from 'vitest';
import { shape, usePostgresJs } from './helpers';

const u = usePostgresJs();

const cases: [string, string][] = [
  ['timestamp', `'2026-06-01 12:00:00.123456'::timestamp`],
  ['timestamp in a gap of daylight saving time', `'2026-03-29 02:30:00'::timestamp`],
  ['timestamp infinity', `'infinity'::timestamp`],
  ['timestamp -infinity', `'-infinity'::timestamp`],
  ['timestamp BC', `'0044-03-15 12:00:00 BC'::timestamp`],
  ['timestamp of year 99', `'0099-01-01 00:00:00'::timestamp`],
  ['timestamptz', `'2026-06-01 12:00:00.123456+00'::timestamptz`],
  ['timestamptz infinity', `'infinity'::timestamptz`],
  ['timestamptz of 1900', `'1900-01-01 00:00:00+00'::timestamptz`],
  ['timestamptz BC', `'0044-03-15 12:00:00+00 BC'::timestamptz`],
  ['date', `'2026-06-01'::date`],
  ['date infinity', `'infinity'::date`],
  ['date BC', `'0044-03-15 BC'::date`],
  ['date of year 99', `'0099-01-01'::date`],
  ['int2', `1::int2`], ['int4', `1::int4`], ['oid', `1::oid`],
  ['int8', `9007199254740993::int8`],
  ['numeric', `1.10::numeric`], ['numeric NaN', `'NaN'::numeric`],
  ['float4', `0.1::float4`], ['float8 NaN', `'NaN'::float8`], ['float8 -0', `'-0'::float8`],
  ['money', `12.34::money`], ['bool', `true`],
  ['json', `'{"a":1,"b":[1,2],"big":12345678901234567890}'::json`],
  ['json string', `'"s"'::json`], ['json null', `'null'::json`],
  ['jsonb', `'{"a":1,"b":[1,2]}'::jsonb`], ['jsonb array', `'[1,2]'::jsonb`],
  ['bytea', `'\\xdeadbeef'::bytea`], ['bytea empty', `''::bytea`],
  ['interval', `'1 year 2 mons 3 days 04:05:06.789'::interval`],
  ['interval negative', `'-1 day -00:00:01'::interval`], ['interval zero', `'0'::interval`],
  ['point', `'(1.5,2)'::point`], ['circle', `'<(1,2),3>'::circle`],
  ['uuid', `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid`], ['xml', `'<a/>'::xml`],
  ['time', `'04:05:06.789'::time`], ['timetz', `'04:05:06+02'::timetz`],
  ['inet', `'10.0.0.1'::inet`], ['cidr', `'10.0.0.0/8'::cidr`], ['macaddr', `'08:00:2b:01:02:03'::macaddr`],
  ['bit', `B'101'::bit(3)`], ['varbit', `B'10'::varbit`],
  ['tsvector', `'a b'::tsvector`], ['tsquery', `'a & b'::tsquery`],
  ['int4multirange', `'{[1,3)}'::int4multirange`], ['int4range', `'[1,3)'::int4range`],
  ['tstzrange', `'[2026-06-01 00:00+00,2026-06-02 00:00+00)'::tstzrange`],
  ['char(4)', `'ab'::char(4)`], ['name', `'n'::name`], ['citext', `'Ab'::ext.citext`],
  ['enum', `'ok'::public.mood`], ['enum[]', `'{ok,sad}'::public.mood[]`],
  ['domain over int4', `5::public.positive_int`], ['domain over citext', `'a@b.c'::public.email`],
  ['domain over text[]', `'{a,b}'::public.tag_list`], ['domain over int8', `5::public.ticket_no`],
  ['domain over jsonb', `'{"a":1}'::public.preferences`],
  ['composite', `ROW('s','c','z')::public.address`], ['range of a type of its own', `'[1.5,2)'::public.float_range`],
  ['timestamp[]', `ARRAY['2026-06-01 12:00'::timestamp, NULL]`],
  ['timestamptz[]', `ARRAY['2026-06-01 12:00+00'::timestamptz, NULL]`],
  ['date[]', `ARRAY['2026-06-01'::date, NULL]`],
  ['int8[]', `ARRAY[9007199254740993::int8, NULL]`],
  ['numeric[]', `ARRAY[1.10::numeric, NULL]`],
  ['json[]', `ARRAY['{"a":1}'::json, NULL]`], ['jsonb[]', `ARRAY['{"a":1}'::jsonb, NULL]`],
  ['bytea[]', `ARRAY['\\xdead'::bytea, NULL]`],
  ['interval[]', `ARRAY['1 day'::interval, NULL]`], ['point[]', `ARRAY['(1,2)'::point, NULL]`],
  ['text[]', `ARRAY['a,b', 'c"d', 'NULL', NULL, '']`], ['int4[] of two dimensions', `'{{1,2},{3,4}}'::int4[]`],
  ['int4[] empty', `'{}'::int4[]`], ['int4[] with bounds', `'[0:1]={1,2}'::int4[]`],
  ['bool[]', `ARRAY[true, NULL]`], ['float8[]', `ARRAY[1.5::float8]`],
  ['uuid[]', `ARRAY['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid]`],
  ['array of a domain', `ARRAY[5::public.ticket_no]`], ['array of a composite', `ARRAY[ROW('s','c','z')::public.address]`],
  ['NULL timestamp', `NULL::timestamp`], ['NULL jsonb', `NULL::jsonb`], ['NULL int8', `NULL::int8`],
];

describe.each([
  ['simple protocol', (expr: string) => ({ text: `SELECT ${expr} AS v`, values: [] })],
  ['extended protocol', (expr: string) => ({ text: `SELECT ${expr} AS v, $1::int AS one`, values: [1] })],
])('reads as pg reads, by the %s:', (_, query) => {
  it.each(cases)('%s', async (_, expr) => {
    const [{ rows: [viaPg] }, { rows: [viaAdapter] }] = [await u.t.client.query(query(expr)), await u.pool.query(query(expr))];
    expect(shape(viaAdapter.v)).toEqual(shape(viaPg.v));
  });
});

describe('extra.type_zoo', () => {
  beforeAll(async () => {
    await u.t.pool.query(`INSERT INTO extra.type_zoo (c_int2, c_int4, c_int8, c_numeric, c_float4, c_float8, c_money, c_bool,
      c_text, c_varchar, c_char, c_citext, c_name, c_bytea, c_uuid, c_json, c_jsonb, c_xml, c_date, c_time, c_timetz,
      c_timestamp, c_timestamptz, c_interval, c_inet, c_cidr, c_macaddr, c_bit, c_varbit, c_tsvector, c_tsquery, c_point,
      c_oid, c_int4multirange, c_text_array, c_jsonb_array, c_uuid_array, c_date_array, c_enum_array, c_int8_domain,
      c_jsonb_domain)
      VALUES (1, 2, 9007199254740993, 1.10, 0.1, 0.1, 12.34, true, 't', 'v', 'ab', 'Ab', 'n', '\\xdeadbeef',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '{"a":1}', '{"a":1}', '<a/>', '2026-06-01', '04:05:06', '04:05:06+02',
      '2026-06-01 12:00:00.123456', '2026-06-01 12:00:00+00', '1 day', '10.0.0.1', '10.0.0.0/8', '08:00:2b:01:02:03',
      B'101', B'10', 'a b', 'a & b', '(1,2)', 1, '{[1,3)}', '{a,b}', ARRAY['{"a":1}'::jsonb],
      ARRAY['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid], ARRAY['2026-06-01'::date], '{ok,sad}', 9007199254740993,
      '{"a":1}'), (DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
      DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
      DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT,
      DEFAULT, DEFAULT, DEFAULT, DEFAULT)`);
  });

  it('reads each column as pg reads it, of a row of values and of a row of NULLs', async () => {
    const query = { text: 'SELECT * FROM extra.type_zoo ORDER BY id', values: [] };
    const [{ rows: viaPg }, { rows: viaAdapter }] = [await u.t.client.query(query), await u.pool.query(query)];
    expect(viaPg).toHaveLength(2);
    expect(shape(viaAdapter)).toEqual(shape(viaPg));
  });
});
