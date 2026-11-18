// Copyright (C) 2026 Alexandre Demartin
//
// A library's functions that return an aggregate, with aggregatesTypedByColumn declared in ConfigTypes:
// this program emits declarations (tsconfig.json), as a package built with `declaration: true` does, so
// every type these functions return must have a name a .d.ts can write (TS4023 otherwise).

import * as db from 'zapatos/db';
import * as gen from 'zapatos/generate';
import type * as s from 'zapatos/schema';

export const accountCount = () => db.count('accounts', db.all);
export const totalBalance = () => db.sum('accounts', db.all, { columns: ['balance'] });
export const meanRatio = () => db.avg('accounts', db.all, { columns: ['ratio'] });
export const firstEvent = () => db.min('events', db.all, { columns: ['occurred_on'] });
export const lastName = () => db.max('users', db.all, { columns: ['display_name'] });

export const userWithAggregates = (id: number) => db.selectOne('users', { id }, {
  lateral: {
    accounts: db.count('accounts', { owner_id: db.parent('id') }),
    total: db.sum('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
    mean: db.avg('accounts', { owner_id: db.parent('id') }, { columns: ['ratio'] }),
    first: db.min('events', db.all, { columns: ['occurred_on'] }),
    last: db.max('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
  },
});

export const firstEventOfUser = (id: number) => db.selectOne('users', { id }, { lateral: db.min('events', db.all, { columns: ['occurred_on'] }) });

// a rows query, whose type names RowsQuery, its second type argument
export const userRows = (since: Date) => db.selectRows('users', { created_at: db.conditions.gt(since) }, { lateral: db.min('events', db.all, { columns: ['occurred_on'] }) });

// every function and value of zapatos/db and of db.conditions re-exported, as a wrapper module does: each type must be
// one a .d.ts can name (TS4023 otherwise), so a type that names an unexported interface is written inline. An object
// rest writes out every member, so an export added later is covered with no edit here
const { conditions, ...values } = db;
export const dbValues = values;
export const { ...allConditions } = conditions;

// a generic forwarder writes out the type of select()'s lock option, where the alias is still `A` (TS2742 if that type
// names one a consumer cannot import, #578)
export const lockOf = <A extends string>(options: db.SelectOptionsForTable<'users', undefined, undefined, undefined, A>) => options.lock;

// forwarders that write out the type of select()'s order option, for one table and for any (TS4023 if that type names
// one zapatos/db does not export, #580)
export const orderOf = (options: db.SelectOptionsForTable<'users', undefined, undefined, undefined, never>) => options.order;
export const orderOfTable = <T extends s.Table>(options: db.SelectOptionsForTable<T, undefined, undefined, undefined, never>) =>
  options.order;

// spreads of raw(), param(), cols(), vals() and parent(), in a variable, a function and a method, and an object rest of
// a Parameter: each writes out their members, as on Zapatos 6.6.1 (TS4023, TS4058 or TS4053 if one names their tag,
// #582). Not covered, documented: the members of a TsvectorColumn, or of min() and max() typed by column, which name
// an unexported symbol (test/unit/declarationEmit.test.ts)
export const wrapperSpreads = {
  raw: { ...db.raw('x') }, param: { ...db.param(1), cast: 'int4' }, cols: { ...db.cols(['id']) },
  vals: { ...db.vals({ id: 1 }) }, parent: { ...db.parent('id') },
};
export function rawSpread() { return { ...db.raw('x') }; }
export class Spreads { parent() { return { ...db.parent('id') }; } }
export const restOf = (x: db.Parameter<string>) => { const { cast, ...rest } = x; return rest; };

// forwarders that write out the types of the schemas and columnOptions options of zapatos/generate's Config, and every
// value of zapatos/generate re-exported through an object rest (TS4023 or TS2742 if a type names one zapatos/generate
// does not export, #584)
export const schemasOf = (config: gen.Config) => config.schemas;
export const columnOptionsOf = (config: gen.Config) => config.columnOptions;
export const { ...generateValues } = gen;

// run() on a client that isn't pg's, and run itself, as a library re-exports them (#695)
export const usersOn = (queryable: db.QueryableLike) => db.select('users', db.all).run(queryable);
export const runOfUsers = db.select('users', db.all).run;

// the event listener of the config, whose type names TransactionEvent (#725)
export const transactionEventListenerOf = (config: db.Config) => config.transactionEventListener;

// a transaction on a pool of another driver, whose result is the callback's client, and on a pool typed by
// transaction()'s first parameter, as a library writes them: each type must be one a .d.ts can name (#696)
type OtherClient = { query: (query: db.SQLQuery) => Promise<{ rows: any[]; command: string }>; release: () => void };
export const clientOf = (pool: db.PoolLike<OtherClient>) => db.serializable(pool, async txnClient => txnClient);
export const savepointClientOf = (pool: db.PoolLike<OtherClient>) => db.serializable(pool, txnClient => db.savepoint(txnClient, async spClient => spClient));  // #723
export const anyPoolClientOf = (pool: db.PoolLike) => db.readCommitted(pool, async txnClient => txnClient);
export const firstParameterOf = (queryable: Parameters<typeof db.serializable>[0]) => [queryable];

// an advisory lock in a transaction of another driver's pool, and on a client typed by advisoryXactLock()'s first
// parameter, as a library writes them (#724)
export const lockIn = (pool: db.PoolLike<OtherClient>) => db.serializable(pool, txnClient => db.advisoryXactLock(txnClient, [1, 42]));
export const lockOn = (txnClient: Parameters<typeof db.advisoryXactLock>[0], key: Parameters<typeof db.advisoryXactLock>[1]) =>
  db.advisoryXactLock(txnClient, key);

// settings for the rest of a transaction of another driver's pool, and on a client typed by setLocal()'s parameters,
// as a library writes them (#738)
export const settingsIn = (pool: db.PoolLike<OtherClient>) => db.serializable(pool, txnClient => db.setLocal(txnClient, { 'app.customer': 'Ada Quill' }));
export const settingsOn = (txnClient: Parameters<typeof db.setLocal>[0], settings: Parameters<typeof db.setLocal>[1]) =>
  db.setLocal(txnClient, settings);

// the batches of a cursor in a transaction of another driver's pool, and on a client and a query typed by cursor()'s
// parameters, as a library writes them (#743)
export const batchesIn = (pool: db.PoolLike<OtherClient>) => db.serializable(pool, async txnClient => {
  for await (const rows of db.cursor(txnClient, db.sql`SELECT 1`, { batchSize: 100 })) return rows;
  return [];
});
export const batchesOf = <R extends readonly unknown[]>(txnClient: Parameters<typeof db.cursor>[0], query: db.SQLFragment<R, any>) =>
  db.cursor(txnClient, query, { batchSize: 100 });
