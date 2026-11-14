// Copyright (C) 2026 Alexandre Demartin
//
// A library's functions that return an aggregate, with aggregatesTypedByColumn declared in ConfigTypes:
// this program emits declarations (tsconfig.json), as a package built with `declaration: true` does, so
// every type these functions return must have a name a .d.ts can write (TS4023 otherwise).

import * as db from 'zapatos/db';

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

export const { count, sum, avg, min, max } = db;
