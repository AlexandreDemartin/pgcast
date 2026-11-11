// Copyright (C) 2026 Alexandre Demartin
//
// Reads of a schema-heavy app against the fixture's generated schema: what
// `npm run bench:types` type-checks. Never run; every result is used, so its
// type is fully computed, as in a real project.

import * as db from 'zapatos/db';
import { all, conditions as dc, parent, sql } from 'zapatos/db';
import type * as s from 'zapatos/schema';

export async function userProfile(pool: db.Queryable, id: number) {
  const user = await db.selectExactlyOne('users', { id }, {
    columns: ['id', 'display_name', 'email', 'mood'],
    lateral: {
      manager: db.selectOne('users', { id: parent('manager_id') }, { columns: ['id', 'display_name'] }),
      accounts: db.select('accounts', { owner_id: parent('id') }, {
        columns: ['id', 'balance', 'opened_on'],
        order: { by: 'opened_on', direction: 'DESC' },
        lateral: {
          sent: db.select('transfers', { from_account: parent('id') }, {
            columns: ['id', 'amount', 'note'],
            lateral: { to: db.selectExactlyOne('accounts', { id: parent('to_account') }, { columns: ['owner_id'] }) },
          }),
          received: db.count('transfers', { to_account: parent('id') }),
        },
      }),
      memberships: db.select('memberships', { user_id: parent('id') }, {
        lateral: { org: db.selectExactlyOne('orgs', { country: parent('org_country'), code: parent('org_code') }) },
      }),
    },
  }).run(pool);

  const manager: string | undefined = user.manager?.display_name;
  const firstTransfer: number | undefined = user.accounts[0]?.sent[0]?.amount;
  const payee: number | undefined = user.accounts[0]?.sent[0]?.to.owner_id;
  const received: number = user.accounts.reduce((n, a) => n + a.received, 0);
  const orgs: string[] = user.memberships.map(m => `${m.role} of ${m.org.name}`);
  return { user, manager, firstTransfer, payee, received, orgs };
}

export async function managerTree(pool: db.Queryable, managerId: number) {
  const tree = await db.select('users', { id: managerId }, {
    alias: 'boss',
    lateral: {
      reports: db.select('users', { manager_id: parent('id') }, {
        alias: 'report',
        columns: ['id', 'display_name'],
        lateral: {
          reports: db.select('users', { manager_id: parent('id') }, {
            alias: 'subreport',
            columns: ['id', 'display_name', 'mood'],
            lateral: { accountCount: db.count('accounts', { owner_id: parent('id') }) },
          }),
        },
      }),
    },
  }).run(pool);

  return tree.flatMap(b => b.reports.flatMap(r => r.reports.map(sr => [b.email, r.display_name, sr.mood, sr.accountCount] as const)));
}

export async function richAccounts(pool: db.Queryable, min: number) {
  const accounts = await db.select('accounts', { balance: dc.gte(min), ratio: dc.isNotNull }, {
    columns: ['id', 'owner_id', 'balance'],
    extras: {
      doubled: sql<s.accounts.SQL, number>`${'balance'} * 2`,
      lifetime: 'lifetime_ops',
    },
    order: [{ by: 'balance', direction: 'DESC' }, { by: 'id', direction: 'ASC', nulls: 'LAST' }],
    limit: 20,
    offset: 0,
  }).run(pool);

  return accounts.map(a => ({ id: a.id, owner: a.owner_id, doubled: a.doubled + 1, ops: a.lifetime }));
}

export async function productSearch(pool: db.Queryable, term: string, skus: string[]) {
  const products = await db.select('products', dc.or(
    { title: dc.ilike(`%${term}%`) },
    { sku: dc.isIn(skus), status: 'published' },
  ), {
    columns: ['id', 'sku', 'variant', 'title', 'price_cents', 'status'],
    extras: { lines: db.count('OrderLines', { 'Product Id': parent('id') }) },
    distinct: true,
  }).run(pool);

  const one = await db.selectOne('products', { sku: skus[0], variant: '' }, {
    lateral: {
      lines: db.select('OrderLines', { 'Product Id': parent('id') }, { columns: ['orderId', 'lineNo', 'unit-price'] }),
    },
  }).run(pool);

  return { titles: products.map(p => p.title ?? `${p.sku}/${p.variant} (${p.lines})`), lines: one?.lines.length ?? 0 };
}

export async function articlesFor(pool: db.Queryable, authorId: number) {
  const articles = await db.select('extra.articles', { author_id: authorId, status: dc.ne('archived') }, {
    lateral: {
      author: db.selectExactlyOne('users', { id: parent('author_id') }, { columns: ['display_name'] }),
      reviewer: db.selectOne('users', { id: parent('reviewer_id') }, {
        columns: ['display_name'],
        lateral: { orgs: db.count('memberships', { user_id: parent('id') }) },
      }),
    },
  }).run(pool);

  const views = await db.select('extra.article_authors', { status: 'published' }).run(pool);
  return {
    bylines: articles.map(a => `${a.body} by ${a.author.display_name}, reviewed by ${a.reviewer?.display_name ?? 'nobody'} (${a.reviewer?.orgs ?? 0})`),
    authors: views.map(v => v.author),
  };
}

export async function dashboard(pool: db.Queryable, since: Date) {
  const [users, happy, accounts, total, avgRatio, highest, recent, events, totals] = await Promise.all([
    db.count('users', all).run(pool),
    db.count('users', { mood: 'happy', created_at: dc.after(since) }).run(pool),
    db.count('accounts', { opened_on: dc.between(since, new Date()) }).run(pool),
    db.sum('accounts', all, { columns: ['balance'] }).run(pool),
    db.avg('accounts', { ratio: dc.isNotNull }, { columns: ['ratio'] }).run(pool),
    db.max('accounts', all, { columns: ['balance'] }).run(pool),
    db.select('users', { created_at: dc.gt(since) }, { columns: ['id', 'email'], order: { by: 'created_at', direction: 'DESC' }, limit: 5 }).run(pool),
    db.select('events', { kind: dc.isIn(['signup', 'login']), occurred_on: dc.gte(since) }, { columns: ['kind', 'payload'] }).run(pool),
    db.select('account_totals', { owner_id: dc.isNotNull }).run(pool),
  ]);

  const kinds: string[] = events.map(e => e.kind);
  return { users, happy, accounts, total, avgRatio, highest, recent: recent.map(r => r.email), kinds, totals: totals.map(t => t.total_balance) };
}

export async function lockedAccount(pool: db.Queryable, id: db.Int8String) {
  const account = await db.selectExactlyOne('accounts', { id }, {
    lock: { for: 'NO KEY UPDATE', wait: 'NOWAIT' },
    lateral: { owner: db.selectExactlyOne('users', { id: parent('owner_id') }, { columns: ['id', 'email'] }) },
  }).run(pool);
  return [account.balance, account.owner.email] as const;
}

export async function typedSQL(pool: db.Queryable, mood: s.mood) {
  type Row = Pick<s.users.Selectable, 'id' | 'display_name'> & { accounts: number };
  const rows = await sql<s.users.SQL | s.accounts.SQL, Row[]>`
    SELECT ${'users'}.${'id'}, ${'display_name'}, count(${'accounts'}.*)::int AS accounts
    FROM ${'users'} LEFT JOIN ${'accounts'} ON ${'accounts'}.${'owner_id'} = ${'users'}.${'id'}
    WHERE ${{ mood }} GROUP BY ${'users'}.${'id'}`.run(pool);

  const ids = rows.map(r => r.id);
  const where: s.users.Whereable = { id: dc.isIn(ids), display_name: dc.like('A%') };
  const named = await sql<s.users.SQL, s.users.Selectable[]>`
    SELECT * FROM ${'users'} WHERE ${where} AND ${{ email: dc.isNotNull }}`.run(pool);

  return named.map(u => [u.id, u.created_at.getTime()] as const);
}
