// Copyright (C) 2026 Alexandre Demartin
//
// asPool() fits the core as a consumer compiles it: against the declarations the package ships (the root's db.d.ts,
// built first) and the fixture's generated schema, and the typings of the postgres.js installed, 3.4 or 4.x.

import postgres from 'postgres';
import pg from 'pg';
import { expectTypeOf } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import { asPool, type PostgresJsClient } from '../../src';

const
  sql = postgres('postgres://nobody@127.0.0.1:1/none'),
  pool = asPool(sql),
  pgPool = new pg.Pool();

// run() resolves to what it resolves to on a pg pool
expectTypeOf(db.select('users', db.all).run(pool)).toEqualTypeOf(db.select('users', db.all).run(pgPool));
expectTypeOf(db.select('users', db.all).run(pool)).toEqualTypeOf<Promise<s.users.JSONSelectable[]>>();
expectTypeOf(db.sql<s.users.SQL, s.users.Selectable[]>`SELECT * FROM ${'users'}`.run(pool)).toEqualTypeOf<Promise<s.users.Selectable[]>>();
expectTypeOf(db.count('users', db.all).run(pool)).toEqualTypeOf<Promise<number>>();
const queryable: db.QueryableLike = pool, poolLike: db.PoolLike<PostgresJsClient> = pool;
void queryable; void poolLike;

// transaction() gives the callback the adapter's client, at the levels the call asks for
const counted = db.serializable(pool, c => {
  expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<PostgresJsClient, db.IsolationLevel.Serializable>>();
  expectTypeOf(c).not.toBeAny();
  return db.count('users', db.all).run(c);
});
expectTypeOf(counted).toEqualTypeOf<Promise<number>>();
const committed = db.transaction(pool, db.IsolationLevel.RepeatableRead, async c => {
  expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<PostgresJsClient, db.IsolationSatisfying<db.IsolationLevel.RepeatableRead>>>();
  return db.selectOne('users', { id: 1 }).run(c);
});
expectTypeOf(committed).toEqualTypeOf<Promise<s.users.JSONSelectable | undefined>>();

// refused
// @ts-expect-error a pg pool is no postgres.js sql
asPool(pgPool);
// @ts-expect-error nor is a client with query() alone
asPool({ query: async () => ({ rows: [] }) });
void sql.begin(tx => {
  // @ts-expect-error a postgres.js transaction has no reserve(), for transaction() to take a connection
  asPool(tx);
});
const takesPgClient = (c: db.TxnClientForSerializable) => c;
void db.serializable(pool, async c => {
  // @ts-expect-error its query() takes pg's query object, as run() sends it, not a string
  await c.query('SELECT 1');
  // @ts-expect-error nor is it a pg client
  takesPgClient(c);
});
