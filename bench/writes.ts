// Copyright (C) 2026 Alexandre Demartin
//
// Writes of a schema-heavy app against the fixture's generated schema: what
// `npm run bench:types` type-checks. Never run; every result is used, so its
// type is fully computed, as in a real project.

import * as db from 'zapatos/db';
import { conditions as dc, Default, sql } from 'zapatos/db';
import type * as s from 'zapatos/schema';

export async function signUp(pool: db.Queryable, email: string, name: string, managerId: number | null) {
  return db.serializable(pool, async txn => {
    const user = await db.insert('users', {
      email, display_name: name, manager_id: managerId, mood: 'ok', settings: { theme: 'light' }, tags: ['new'],
    }, { returning: ['id', 'email', 'created_at'] }).run(txn);

    const [current, savings] = await db.insert('accounts', [
      { owner_id: user.id },
      { owner_id: user.id, balance: 0, overdraft_limit: 100, scores: [1, 2], flags: [true] },
    ], { returning: ['id', 'balance'], extras: { owner: 'owner_id' } }).run(txn);

    const event = await db.insert('events', {
      occurred_on: new Date(), kind: 'signup', payload: { user: user.id },
    }, { returning: ['id'], extras: { day: sql<s.events.SQL, string>`${'occurred_on'}::text` } }).run(txn);

    return { id: user.id, created: user.created_at, accounts: [current?.id, savings?.owner], event: event.day };
  });
}

export async function importProducts(pool: db.Queryable, rows: s.products.Insertable[]) {
  const upserted = await db.upsert('products', rows, ['sku', 'variant'], {
    updateColumns: ['title', 'price_cents', 'status'],
    noNullUpdateColumns: 'title',
    returning: ['id', 'sku', 'variant', 'status'],
  }).run(pool);

  const one = await db.upsert('products', { sku: 'MUG', variant: '', price_cents: 900 },
    db.constraint('products_sku_variant_key'), { updateValues: { price_cents: 950 }, reportAction: 'suppress' }).run(pool);

  const skipped = await db.upsert('memberships', { user_id: 1, org_country: 'FR', org_code: 'acme' },
    ['user_id', 'org_country', 'org_code'], { updateColumns: db.doNothing, returning: ['role'] }).run(pool);

  return {
    inserted: upserted.filter(p => p.$action === 'INSERT').map(p => `${p.sku}/${p.variant}`),
    price: one.price_cents,
    role: skipped?.role,
  };
}

export async function moveMoney(pool: db.Queryable, from: db.Int8String, to: db.Int8String, amount: number) {
  return db.transaction(pool, db.IsolationLevel.RepeatableRead, async txn => {
    const [debited] = await db.update('accounts', { balance: sql`${'balance'} - ${db.param(amount)}`, lifetime_ops: sql`${'lifetime_ops'} + 1` },
      { id: from, balance: dc.gte(amount) }, { returning: ['id', 'balance'] }).run(txn);
    if (!debited) throw new Error('insufficient funds');

    const [credited] = await db.update('accounts', { balance: sql`${'balance'} + ${db.param(amount)}` },
      { id: to }, { returning: ['balance'], extras: { owner: 'owner_id' } }).run(txn);

    const transfer = await db.insert('transfers', {
      from_account: from, to_account: to, amount, note: Default, valid_during: '[2026-01-01,2026-02-01)',
    }).run(txn);

    return { left: debited.balance, right: credited?.balance, owner: credited?.owner, id: transfer.id, note: transfer.note };
  });
}

export async function tidyUp(pool: db.Queryable, before: Date, sadIds: number[]) {
  const moods = await db.update('users', { mood: 'happy', tags: Default }, dc.and(
    { id: dc.isIn(sadIds) },
    { mood: 'sad' },
    dc.not({ manager_id: dc.isNull }),
  ), { returning: ['id', 'mood'] }).run(pool);

  const settings = await db.update('users', { settings: { theme: 'dark', beta: true } },
    sql<s.users.SQL>`${'created_at'} < ${db.param(before)}`, { returning: ['id'], extras: { theme: sql<s.users.SQL, string | null>`${'settings'}->>'theme'` } }).run(pool);

  const gone = await db.deletes('events', { occurred_on: dc.lt(before), kind: dc.isNotIn(['signup']) },
    { returning: ['id', 'kind'], extras: { day: 'occurred_on' } }).run(pool);

  const left = await db.deletes('memberships', { since: dc.before(before), role: dc.ne('owner') }).run(pool);

  const drafts = await db.deletes('extra.articles', { status: 'draft', reviewer_id: dc.isNull },
    { returning: ['id', 'body'] }).run(pool);

  const zoo = await db.update('extra.type_zoo', { c_text: 'x', c_jsonb: [1, 'two'], c_uuid_array: [] },
    { c_bool: dc.isDistinctFrom(true), c_int4: dc.or(dc.lt(0), dc.gt(100)) }, { returning: ['id', 'c_timestamptz'] }).run(pool);

  return {
    moods: moods.map(m => m.mood), themes: settings.map(u => u.theme), gone: gone.map(e => [e.kind, e.day]),
    left: left.map(m => m.user_id), drafts: drafts.map(a => a.body.length), zoo: zoo.map(z => z.c_timestamptz),
  };
}

export async function renameOrg(pool: db.Queryable, country: string, code: string, name: string) {
  const [org] = await db.update('orgs', { name }, { country, code }, {
    returning: ['country', 'code', 'name'],
    extras: { members: db.count('memberships', { org_country: country, org_code: code }) },
  }).run(pool);

  const children = await db.update('orgs', { parent_code: code }, sql<s.orgs.SQL>`${{ parent_country: country }} AND ${'parent_code'} IS NULL`).run(pool);

  const lines = await db.insert('OrderLines', [
    { orderId: 2, lineNo: 1, 'Product Id': 1, 'unit-price': 12.5 },
    { orderId: 2, lineNo: 2, 'Product Id': 2, 'unit-price': '12.50', select: 'gift' },
  ], { returning: ['orderId', 'lineNo', 'select'] }).run(pool);

  return { name: org?.name, members: org?.members, children: children.length, gifts: lines.filter(l => l.select).length };
}
