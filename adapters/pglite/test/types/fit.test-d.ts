// Copyright (C) 2026 Alexandre Demartin
//
// asPool() fits the core as a consumer compiles it: against the declarations the package ships (the root's db.d.ts,
// built first) and the fixture's generated schema, and the typings of the PGlite installed, 0.5.0 to 0.5.16.

import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { PGliteWorker } from '@electric-sql/pglite/worker';
import pg from 'pg';
import { expectTypeOf } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import { asPool, type PGliteClient } from '../../src';

const
  pool = asPool(new PGlite()),
  pgPool = new pg.Pool();

// a PGliteWorker fits too
declare const worker: PGliteWorker;
asPool(worker);

// run() resolves to what it resolves to on a pg pool
expectTypeOf(db.select('users', db.all).run(pool)).toEqualTypeOf(db.select('users', db.all).run(pgPool));
expectTypeOf(db.select('users', db.all).run(pool)).toEqualTypeOf<Promise<s.users.JSONSelectable[]>>();
expectTypeOf(db.sql<s.users.SQL, s.users.Selectable[]>`SELECT * FROM ${'users'}`.run(pool)).toEqualTypeOf<Promise<s.users.Selectable[]>>();
expectTypeOf(db.count('users', db.all).run(pool)).toEqualTypeOf<Promise<number>>();
const queryable: db.QueryableLike = pool, poolLike: db.PoolLike<PGliteClient> = pool;
void queryable; void poolLike;

// transaction() gives the callback the adapter's client, at the levels the call asks for
const counted = db.serializable(pool, c => {
  expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<PGliteClient, db.IsolationLevel.Serializable>>();
  expectTypeOf(c).not.toBeAny();
  return db.count('users', db.all).run(c);
});
expectTypeOf(counted).toEqualTypeOf<Promise<number>>();
const committed = db.transaction(pool, db.IsolationLevel.RepeatableRead, async c => {
  expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<PGliteClient, db.IsolationSatisfying<db.IsolationLevel.RepeatableRead>>>();
  return db.selectOne('users', { id: 1 }).run(c);
});
expectTypeOf(committed).toEqualTypeOf<Promise<s.users.JSONSelectable | undefined>>();

// refused, on the typings of each PGlite of the peer range
declare const tx: Transaction;
// @ts-expect-error a PGlite transaction has no execProtocol() nor runExclusive()
asPool(tx);
// @ts-expect-error a pg pool is no PGlite
asPool(pgPool);
// @ts-expect-error nor is a client with query() alone
asPool({ query: async () => ({ rows: [] }) });
const takesPgClient = (c: db.TxnClientForSerializable) => c;
void db.serializable(pool, async c => {
  // @ts-expect-error its query() takes pg's query object, as run() sends it, not a string
  await c.query('SELECT 1');
  // @ts-expect-error nor is it a pg client
  takesPgClient(c);
});
