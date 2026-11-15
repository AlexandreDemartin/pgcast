// Copyright (C) 2026 Alexandre Demartin
//
// transaction() must not read pg.native when nothing has (#268). pg 7 defines
// `native` as an own, enumerable getter that require()s pg-native, prints
// "Cannot find module 'pg-native'" when it is missing, rethrows any other error
// (an addon that fails to load), then replaces itself with a data property.
// vi.mock gives pg that shape, re-armed before each test. No database.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as pg from 'pg';
import * as db from '../../src/db';
import { IsolationLevel } from '../../src/db';

const pg7 = vi.hoisted(() => {
  /** A connected native client, with no `_connected`: only `instanceof pg.native.Client` classes it as a client. */
  class Client {
    sent: string[] = [];
    async query(q: string | { text: string }) {
      const text = typeof q === 'string' ? q : q.text;
      this.sent.push(text);
      return { rows: [], command: text.split(' ')[0], rowCount: 0 };
    }
    async connect() {
      this.sent.push('connect()');
      throw new Error('Client has already been connected. You cannot reuse a client.');
    }
  }
  const state = { reads: 0, module: {} as Record<string, unknown> };
  /** pg 7's lazy getter: counts its reads, then replaces itself with the value, as pg 7's does. */
  const arm = () => Object.defineProperty(state.module, 'native', {
    enumerable: true, configurable: true,
    get() {
      state.reads++;
      Object.defineProperty(state.module, 'native', { value: { Client, Pool: class {} }, enumerable: true, configurable: true, writable: true });
      return state.module.native;
    },
  });
  return { Client, state, arm };
});

vi.mock('pg', async importOriginal => {
  pg7.state.module = { ...await importOriginal<typeof import('pg')>() };
  pg7.arm();
  return pg7.state.module;
});

beforeEach(() => { pg7.state.reads = 0; pg7.arm(); });

const queryable = (q: object) => q as unknown as db.Queryable;

describe('transaction() with pg 7, pg.native not yet read', () => {
  it('on a pool, does not read pg.native', async () => {
    // pg 7's pg.Pool returns a pg-pool instance, so it fails `instanceof pg.Pool`, as this does
    const sent: string[] = [];
    const pool = { async connect() { return Object.assign(new pg7.Client(), { sent, release: () => { sent.push('release()'); } }); } };
    expect(await db.transaction(queryable(pool), IsolationLevel.ReadCommitted, async () => 'done')).toBe('done');
    expect(sent).toEqual(['START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'COMMIT', 'release()']);
    expect(pg7.state.reads).toBe(0);
  });
});

describe('transaction() with pg 7, pg.native read by the caller', () => {
  it('on a pg.native.Client, runs on the client itself, without connect(), and does not read the getter again', async () => {
    const client = new (pg as unknown as { native: { Client: typeof pg7.Client } }).native.Client();
    expect(pg7.state.reads).toBe(1);
    expect(await db.transaction(queryable(client), IsolationLevel.Serializable, async () => 'done')).toBe('done');
    expect(client.sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
    expect(pg7.state.reads).toBe(1);
  });
});
