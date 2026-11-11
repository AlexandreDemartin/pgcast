// Integration smoke test of the harness: a fresh database per file, the fixture
// loaded, and each test isolated by a ROLLBACK.
import { describe, expect, inject, it } from 'vitest';
import { useTestDatabase } from '../helpers/db';

const t = useTestDatabase();

const one = async <T = unknown>(text: string): Promise<T> => (await t.client.query(text)).rows[0].v as T;

describe('test database', () => {
  it('is a fresh pgcast_test_* copy of the template, not the configured database', async () => {
    const ctx = inject('pgcastDb')!;
    const current = await one<string>('SELECT current_database() AS v');
    expect(current).toBe(t.name);
    expect(current.startsWith(ctx.prefix)).toBe(true);
    expect(current).not.toBe(ctx.template);
    // inside BEGIN: now() is frozen at the start of the transaction
    expect(await one('SELECT now()::text AS v')).toBe(await one('SELECT now()::text AS v'));
  });

  it('sorts text the same way on every OS: UTF8, locale C', async () => {
    const { rows } = await t.client.query(`SELECT pg_encoding_to_char(encoding) AS encoding, datcollate, datctype,
      (SELECT string_agg(x, ',' ORDER BY x) FROM (VALUES ('b'), ('B'), ('a'), ('é')) v(x)) AS sorted
      FROM pg_database WHERE datname = current_database()`);
    expect(rows[0]).toEqual({ encoding: 'UTF8', datcollate: 'C', datctype: 'C', sorted: 'B,a,b,é' });
  });
});

describe('fixture', () => {
  // [family, query returning one value `v`, expected value]
  const checks: [string, string, unknown][] = [
    ['schemas', `SELECT string_agg(nspname, ',' ORDER BY nspname) AS v FROM pg_namespace
      WHERE nspname IN ('public', 'extra', 'edge', 'ext')`, 'edge,ext,extra,public'],
    ['extensions', `SELECT string_agg(extname, ',' ORDER BY extname) AS v FROM pg_extension WHERE extname <> 'plpgsql'`,
      'citext,file_fdw,pg_trgm,unaccent'],
    ['enum', `SELECT enum_range(NULL::public.mood)::text AS v`, '{sad,ok,happy}'],
    ['enum with quote', `SELECT enum_range(NULL::edge."traffic-light")::text AS v`, '{red,amber\'s,"green light"}'],
    ['domain over citext', `SELECT 'X@Y.org'::public.email OPERATOR(ext.=) 'x@y.org' AS v`, true],
    ['composite', `SELECT (home).city AS v FROM public.users WHERE display_name = 'Ada'`, 'London'],
    ['custom range', `SELECT weight_kg::text AS v FROM public.products WHERE variant = 'S'`, '[0.1,0.2)'],
    ['built-in range', `SELECT upper(batch_sizes) AS v FROM public.transfers WHERE batch_sizes IS NOT NULL`, 10],
    ['jsonb', `SELECT settings->>'theme' AS v FROM public.users WHERE id = 1`, 'dark'],
    ['array', `SELECT grid[2][1] AS v FROM public.accounts WHERE id = 1`, 3],
    ['int8 beyond 2^53', `SELECT lifetime_ops::text AS v FROM public.accounts WHERE id = 1`, '9007199254740993'],
    ['generated column', `SELECT price_with_vat_cents::text AS v FROM public.products WHERE variant = 'S'`, '1500.0000'],
    ['identity columns', `SELECT string_agg(c, ',' ORDER BY c) AS v FROM (
      SELECT attrelid::regclass || '.' || attname || '=' || attidentity::text AS c FROM pg_attribute
      WHERE attidentity <> '' AND attrelid IN ('public.users'::regclass, 'public.accounts'::regclass)) a`,
      'accounts.id=d,users.id=a'],
    ['default', `SELECT role AS v FROM public.memberships WHERE user_id = 2`, 'member'],
    ['view', `SELECT count(*)::int AS v FROM public.active_users`, 2],
    ['materialized view', `SELECT total_balance::text AS v FROM public.account_totals WHERE owner_id = 1`, '1520.50'],
    ['foreign table', `SELECT count(*)::int AS v FROM extra.imported_lines`, 0],
    ['partitioned table', `SELECT string_agg(tableoid::regclass::text, ',' ORDER BY occurred_on) AS v FROM public.events`,
      'events_2025,events_2026,events_default'],
    ['unique multi-column indexes', `SELECT count(*)::int AS v FROM pg_index
      WHERE indrelid = 'public.products'::regclass AND indisunique AND indnatts > 1`, 2],
    ['FKs: composite, self-referencing, two to one table', `SELECT string_agg(c, ',' ORDER BY c) AS v FROM (
      SELECT conrelid::regclass || '>' || confrelid::regclass || '(' || array_length(conkey, 1) || ')' AS c
      FROM pg_constraint WHERE contype = 'f'
      AND conrelid IN ('public.orgs'::regclass, 'public.transfers'::regclass, 'public.users'::regclass)) f`,
      'orgs>orgs(2),transfers>accounts(1),transfers>accounts(1),users>users(1)'],
    ['SQL function', `SELECT public.full_name('Ada', 'Lovelace') AS v`, 'Ada Lovelace'],
    ['PL/pgSQL function', `SELECT public.account_balance(1)::text AS v`, '1500.50'],
    ['SETOF', `SELECT count(*)::int AS v FROM public.reports_of(1)`, 2],
    ['RETURNS TABLE', `SELECT received::text AS v FROM extra.transfer_totals() WHERE account_id = 3`, '100'],
    ['OUT parameters', `SELECT domain AS v FROM public.split_email('a@b.c')`, 'b.c'],
    ['VARIADIC', `SELECT public.sum_all(1, 2, 3) AS v`, 6],
    ['overloads', `SELECT public.describe(1) || ' / ' || public.describe('a'::text) || ' / ' || public.describe(1, 2) AS v`,
      'int 1 / text a / pair 1,2'],
    ['extension function', `SELECT extra.search_key('Été') AS v`, 'ete'],
    ['procedure', `SELECT count(*)::int AS v FROM pg_proc WHERE prokind = 'p' AND proname = 'cheer_up'`, 1],
    ['COMMENT ON', `SELECT obj_description('public.users'::regclass, 'pg_class') AS v`, 'People who can sign in'],
    ['comment with */', `SELECT col_description('edge."odd table"'::regclass, 2) AS v`, 'Column comment with */ inside'],
    ['quoted identifiers', `SELECT "select" AS v FROM public."OrderLines" WHERE "orderId" = 1 AND "lineNo" = 1`, 'gift'],
  ];

  it.each(checks)('%s', async (_family, text, expected) => {
    expect(await one(text)).toEqual(expected);
  });
});

describe('isolation between tests', () => {
  // Each test writes its own row, then sees exactly one: whatever the order,
  // a missing ROLLBACK makes the second one see two.
  const insertAndCount = async (who: string) => {
    await t.client.query(`INSERT INTO public.users (email, display_name) VALUES ($1, 'isolation probe')`, [`${who}@probe.test`]);
    await t.client.query('UPDATE public.accounts SET balance = balance + 1 WHERE id = 1');
    const { rows } = await t.client.query(`SELECT
      (SELECT count(*)::int FROM public.users WHERE display_name = 'isolation probe') AS probes,
      (SELECT balance::text FROM public.accounts WHERE id = 1) AS balance`);
    expect(rows[0]).toEqual({ probes: 1, balance: '1501.50' });
  };

  it('first writer sees only its own write', () => insertAndCount('first'));
  it('second writer sees only its own write', () => insertAndCount('second'));
});
