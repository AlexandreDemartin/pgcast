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
