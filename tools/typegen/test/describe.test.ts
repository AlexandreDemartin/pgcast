// Copyright (C) 2026 Alexandre Demartin

import pg from 'pg';
import { afterAll, beforeAll, expect, inject, it, vi } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { describeQuery } from '../src/describe';

const db = useTestDatabase();
let client: pg.Client;
beforeAll(async () => {
  // The fixture uses the root's pg. Exercise the package's installed driver on a dedicated connection.
  client = new pg.Client({ connectionString: urlForDatabase(inject('pgcastDb')!.url, db.name) });
  await client.connect();
});
afterAll(async () => { await client?.end(); });

it('reads ordered fields, aliases, origins and inferred and cast parameter OIDs', async () => {
  const { rows: [{ oid }] } = await db.client.query("SELECT 'public.users'::regclass::oid AS oid");
  expect(await describeQuery(client, `
    SELECT display_name AS name, $2::text[] AS labels, id FROM public.users WHERE id = $1
  `)).toEqual({
    fields: [
      { name: 'name', dataTypeID: 25, tableID: oid, columnID: 3 },
      { name: 'labels', dataTypeID: 1009, tableID: 0, columnID: 0 },
      { name: 'id', dataTypeID: 23, tableID: oid, columnID: 1 },
    ],
    parameterOIDs: [23, 1009],
  });
});

it('distinguishes NoData from a RowDescription with zero fields', async () => {
  expect(await describeQuery(client, 'DELETE FROM public.users WHERE id = $1'))
    .toEqual({ fields: null, parameterOIDs: [23] });
  expect(await describeQuery(client, 'SELECT FROM public.users')).toEqual({ fields: [], parameterOIDs: [] });
});

it('recovers after refusals on the same client, releasing its listeners each time', async () => {
  const counts = () => client.connection.eventNames().map(event => [event, client.connection.listenerCount(event)]);
  const initial = counts();
  for (const [text, code] of [
    ['SELECT 1; SELECT 2', '42601'],
    ['SELECT missing_field FROM public.users', '42703'],
  ]) {
    await expect(describeQuery(client, text)).rejects.toMatchObject({ code });
    expect(counts()).toEqual(initial);
    expect((await describeQuery(client, 'SELECT 1 AS good')).fields).toEqual([
      { name: 'good', dataTypeID: 23, tableID: 0, columnID: 0 },
    ]);
    expect(counts()).toEqual(initial);
  }
});

it('sends Parse, statement Describe and Sync between the transaction commands', async () => {
  const sql = 'SELECT $1::int', write = vi.spyOn(client.connection.stream, 'write');
  try {
    await describeQuery(client, sql);
    // The first byte identifies the frontend message. Parse has an unnamed statement and no supplied type OIDs.
    const messages = write.mock.calls.map(([bytes]) => {
      const packet = Buffer.from(bytes);
      return [packet.toString('ascii', 0, 1), packet.toString('utf8', 5)];
    });
    // pg 8.6 sends a Flush inside sync(). Both drivers must reach Sync without Bind or Execute.
    const flush = messages[4]?.[0] === 'H' ? [['H', '']] : [];
    expect(messages).toEqual([
      ['Q', 'BEGIN READ ONLY\0'], ['Q', "SET LOCAL lock_timeout = '1s'\0"],
      ['P', '\0' + sql + '\0\0\0'], ['D', 'S\0'], ...flush, ['S', ''], ['Q', 'ROLLBACK\0'],
    ]);
  } finally {
    write.mockRestore();
  }
});

it('describes DDL, DO, EXPLAIN ANALYZE, a sleep, INSERT RETURNING and nextval without running them', async () => {
  const sequence = 'SELECT last_value, is_called FROM public.users_id_seq',
    users = 'SELECT id FROM public.users ORDER BY id',
    beforeSequence = (await db.client.query(sequence)).rows,
    beforeUsers = (await db.client.query(users)).rows,
    insert = "INSERT INTO public.users (email, display_name) VALUES ('probe@example.com', 'Probe') RETURNING id";
  // An executed sleep raises 57014. A DO body that runs raises P0001.
  await client.query("SET statement_timeout = '3s'");
  try {
    expect((await describeQuery(client, 'CREATE TABLE public.description_probe ()')).fields).toBeNull();
    expect((await describeQuery(client, "DO $$ BEGIN RAISE EXCEPTION 'body ran'; END $$")).fields).toBeNull();
    expect((await describeQuery(client, 'EXPLAIN ANALYZE ' + insert)).fields?.[0].name).toBe('QUERY PLAN');
    expect((await describeQuery(client, 'SELECT pg_sleep(10)')).fields?.[0].dataTypeID).toBe(2278);
    expect((await describeQuery(client, insert)).fields?.[0].name).toBe('id');
    expect((await describeQuery(client, "SELECT nextval('public.users_id_seq')")).fields?.[0].dataTypeID).toBe(20);
    expect((await db.client.query("SELECT to_regclass('public.description_probe') AS probe")).rows).toEqual([{ probe: null }]);
    expect((await db.client.query(users)).rows).toEqual(beforeUsers);
    expect((await db.client.query(sequence)).rows).toEqual(beforeSequence);
  } finally {
    await client.query('RESET statement_timeout');
  }
});

it('times out behind a conflicting lock and rolls back before the next description', async () => {
  await db.client.query('LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE');
  await client.query("SET statement_timeout = '4s'");
  try {
    await expect(describeQuery(client, 'SELECT id FROM public.users')).rejects.toMatchObject({ code: '55P03' });
    expect((await describeQuery(client, 'SELECT FROM pg_catalog.pg_class')).fields).toEqual([]);
  } finally {
    await client.query('RESET statement_timeout');
  }
});
