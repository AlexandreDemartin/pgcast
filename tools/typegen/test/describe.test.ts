// Copyright (C) 2026 Alexandre Demartin

import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { afterAll, beforeAll, expect, inject, it, vi } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { describeQuery } from '../src/describe';

const db = useTestDatabase();
let client: pg.Client;
// The fixture uses the root's pg. Exercise the package's installed driver on a dedicated connection.
async function connect(options: pg.ClientConfig = {}, onError = vi.fn()) {
  const dedicated = new pg.Client({ connectionString: urlForDatabase(inject('pgcastDb')!.url, db.name), ...options });
  dedicated.on('error', onError);
  await dedicated.connect();
  return dedicated;
}

beforeAll(async () => { client = await connect(); });
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

it('distinguishes DELETE without RETURNING (NoData), DELETE RETURNING and a zero-column row', async () => {
  const { rows: [{ oid }] } = await db.client.query("SELECT 'public.users'::regclass::oid AS oid");
  expect(await describeQuery(client, 'DELETE FROM public.users WHERE id = $1'))
    .toEqual({ fields: null, parameterOIDs: [23] });
  expect(await describeQuery(client, 'DELETE FROM public.users WHERE id = $1 RETURNING id'))
    .toEqual({ fields: [{ name: 'id', dataTypeID: 23, tableID: oid, columnID: 1 }], parameterOIDs: [23] });
  expect(await describeQuery(client, 'SELECT FROM public.users')).toEqual({ fields: [], parameterOIDs: [] });
});

function listenerCounts(c: pg.Client) {
  return [c.connection.listenerCount('parameterDescription'), c.connection.listenerCount('noData'), c.listenerCount('error')];
}

it.each(['Parse', 'Describe'])('ends the client when the %s write throws', async stage => {
  const onError = vi.fn(), c = await connect({}, onError), initial = listenerCounts(c);
  const stream = c.connection.stream, write = stream.write.bind(stream), fault = new Error(stage + ' write failed');
  const sent: string[] = [];
  try {
    vi.spyOn(stream, 'write').mockImplementation((packet, ...args) => {
      const tag = packet.toString('ascii', 0, 1);
      if (tag === (stage === 'Parse' ? 'P' : 'D')) throw fault;
      const result = write(packet, ...args);
      sent.push(tag);
      return result;
    });
    const description = describeQuery(c, 'SELECT missing_field FROM public.users');
    await expect(Promise.race([description, delay(2000, 'still pending', { ref: false })])).rejects.toBe(fault);
    expect(sent.includes('P')).toBe(stage === 'Describe');
    expect(onError).toHaveBeenCalledWith(fault);
    expect(stream.destroyed).toBe(true);
    expect(listenerCounts(c)).toEqual(initial);
  } finally {
    stream.destroy();
  }
  const replacement = await connect();
  try {
    expect((await describeQuery(replacement, 'SELECT FROM public.users')).fields).toEqual([]);
  } finally {
    await replacement.end();
  }
});

it('rejects query_timeout before BEGIN and leaves the backend idle', async () => {
  const timed = await connect({ query_timeout: 150 });
  try {
    const { rows: [{ pid }] } = await timed.query('SELECT pg_backend_pid() AS pid');
    const query = vi.spyOn(timed.connection, 'query');
    await expect(describeQuery(timed, 'SELECT 1')).rejects.toThrow('query_timeout');
    expect(query).not.toHaveBeenCalled();
    expect((await db.pool.query('SELECT state FROM pg_stat_activity WHERE pid = $1', [pid])).rows)
      .toEqual([{ state: 'idle' }]);
    expect((await describeQuery(client, 'SELECT FROM public.users')).fields).toEqual([]);
  } finally {
    await timed.end();
  }
});

it.each(['BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY', 'Describe', 'ROLLBACK'])('rejects socket loss during %s and releases the listeners', async stage => {
  const onError = vi.fn(), c = await connect({}, onError), initial = listenerCounts(c);
  const stream = c.connection.stream, write = stream.write.bind(stream);
  try {
    vi.spyOn(stream, 'write').mockImplementation((packet, ...args) => {
      const sent = write(packet, ...args);
      const tag = packet.toString('ascii', 0, 1);
      if ((stage === 'Describe' && tag === 'D') ||
          (tag === 'Q' && packet.toString('utf8', 5, packet.length - 1) === stage)) stream.destroy();
      return sent;
    });
    await expect(describeQuery(c, 'SELECT 1')).rejects.toThrow(/connection|client/i);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(listenerCounts(c)).toEqual(initial);
  } finally {
    if (!stream.destroyed) await c.end();
  }
});

it('keeps the Postgres description error when the connection is lost during rollback', async () => {
  const c = await connect(), stream = c.connection.stream, write = stream.write.bind(stream);
  try {
    vi.spyOn(stream, 'write').mockImplementation((packet, ...args) => {
      const sent = write(packet, ...args);
      if (packet[0] === 0x51 && packet.toString('utf8', 5, packet.length - 1) === 'ROLLBACK') stream.destroy();
      return sent;
    });
    await expect(describeQuery(c, 'SELECT missing_field FROM public.users')).rejects.toMatchObject({ code: '42703' });
    expect(stream.destroyed).toBe(true);
  } finally {
    if (!stream.destroyed) await c.end();
  }
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
  const sql = 'SELECT $1::int', write = vi.spyOn(client.connection.stream, 'write'),
    parse = vi.spyOn(client.connection, 'parse'), describe = vi.spyOn(client.connection, 'describe');
  try {
    await describeQuery(client, sql);
    expect.soft(parse.mock.calls).toEqual([[{ name: '', text: sql, types: [] }]]);
    expect.soft(describe.mock.calls).toEqual([[{ type: 'S', name: '' }]]);
    // The first byte identifies the frontend message. Parse has an unnamed statement and no supplied type OIDs.
    const messages = write.mock.calls.map(([bytes]) => {
      const packet = Buffer.from(bytes);
      return [packet.toString('ascii', 0, 1), packet.toString('utf8', 5)];
    });
    // pg 8.6 sends a Flush inside sync(). Both drivers must reach Sync without Bind or Execute.
    const flush = messages.some(([tag]) => tag === 'H') ? [['H', '']] : [];
    expect(messages).toEqual([
      ['Q', 'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY\0'], ['Q', "SET LOCAL lock_timeout = '1s'\0"],
      ['Q', 'SHOW DateStyle\0'], ['Q', 'SHOW IntervalStyle\0'],
      ['P', '\0' + sql + '\0\0\0'], ['D', 'S\0'], ...flush, ['S', ''], ['Q', 'ROLLBACK\0'],
    ]);
  } finally {
    write.mockRestore();
    parse.mockRestore();
    describe.mockRestore();
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

it.each(['date', 'timestamp', 'timestamptz', 'interval'])('checks the leaf parser for %s arrays', async type => {
  const c = await connect({ options: '-c DateStyle=SQL,DMY -c IntervalStyle=iso_8601' });
  try {
    const value = type === 'interval' ? '2 days' : '2024-03-20';
    const sql = "SELECT ARRAY['" + value + "'::" + type + "] AS items";
    const [item] = (await c.query(sql)).rows[0].items;
    if (type === 'interval') expect(item.days).toBeUndefined();
    else expect(item).toBeNull();
    await expect(describeQuery(c, sql)).rejects.toThrow(type === 'interval' ? /IntervalStyle.*postgres/ : /DateStyle.*ISO/);
    expect((await describeQuery(c, 'SELECT 1')).fields?.[0].dataTypeID).toBe(23);
  } finally {
    await c.end();
  }
});
