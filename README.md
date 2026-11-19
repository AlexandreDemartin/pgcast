# pgcast

**The Postgres you know, with the full power of TypeScript.**

Maintained by [Alexandre Demartin](https://github.com/AlexandreDemartin)

[![npm](https://img.shields.io/npm/v/@pgcast/pgcast.svg)](https://www.npmjs.com/package/@pgcast/pgcast)
[![CI](https://github.com/AlexandreDemartin/pgcast/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/AlexandreDemartin/pgcast/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/AlexandreDemartin/pgcast/blob/master/LICENCE)

> **Status:** published on npm as [`@pgcast/pgcast`](https://www.npmjs.com/package/@pgcast/pgcast), each release and its security fixes in the [changelog](https://pgcast.dev/changelog). 6.6.2 and the releases after it closed security holes of Zapatos 6.6.1, each with its advisory ([fixes by release](https://pgcast.dev/security#fixes-by-release)); 6.7.0 added opt-ins for the surprises that code may rely on, and pgcast's own module names.

## Why pgcast

- **Postgres is the source of the types.** The codegen reads the catalog and writes them; none is written by hand. No ORM, no models, no hidden state: you stay in full control.
- **SQL you can read.** Each shortcut compiles to one predictable query, and the `sql` template is always there: the SQL you write is the SQL that runs.
- **Values are parameters, and names cannot break out.** Every value is sent as `$1`, `$2`, …; a table, column or key that may come from outside is quoted with its `"` doubled.
- **A drop-in for Zapatos.** Same module names, same API, the old behaviour by default wherever code may rely on it ([what differs](#what-differs-from-zapatos-661)): switch without touching an import.

The goal is Zapatos going the last mile. The conditions Postgres offers and raw SQL each get a typed form, so that real code never has to fall back on `db.raw`, hand-written row types or casts. Foreign-key joins have theirs: a [lateral](https://pgcast.dev/lateral), its parent column checked by `db.parent<s.films.Column>('id')`. A function stays a `sql` fragment, its result's type written by hand ([Call a Postgres function](https://pgcast.dev/raw-sql#call-a-postgres-function)), and a CTE goes before a shortcut through `db.withCTEs()` ([Put a CTE before a shortcut](https://pgcast.dev/raw-sql#put-a-cte-before-a-shortcut)).

## At a glance

A film and its cast: the `films` and `roles` tables, where `roles.film_id` references `films.id`. The TypeScript you write:

```typescript
import * as db from 'zapatos/db';
import pool from './pgPool';

const films = await db.select('films', db.all, {
  lateral: {
    cast: db.select('roles', { film_id: db.parent('id') }, {
      order: { by: 'billing', direction: 'ASC' },
    }),
  },
}).run(pool);
```

The SQL it runs, in one round trip:

```sql
SELECT coalesce(jsonb_agg(result), '[]') AS result
FROM (
  SELECT to_jsonb("films".*) || jsonb_build_object($1::text, "lateral_cast".result) AS result
  FROM "films"
  LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(result), '[]') AS result
    FROM (
      SELECT to_jsonb("roles".*) AS result
      FROM "roles"
      WHERE ("film_id" = "films"."id")
      ORDER BY "billing" ASC
    ) AS "sq_roles"
  ) AS "lateral_cast" ON true
) AS "sq_films"
-- values: ["cast"]
```

The type you get, with no annotation (`s` is `zapatos/schema`, the generated module):

```typescript
const films: (s.films.JSONSelectable & { cast: s.roles.JSONSelectable[] })[]
// s.films.JSONSelectable is { genres: string[]; id: number; release_year: number;
//   runtime_minutes: number; studio_id: number; tagline: string | null; title: string }
```

## Install

Switching from Zapatos 6.6.1? Keep your `zapatos/*` imports and [install pgcast 6.x](https://pgcast.dev/switching#swap-the-package) to see its migration warnings. Already on pgcast 6.x? Follow the [7.0 migration guide](https://pgcast.dev/switching#from-7-0).

- `pg` is required. From 7.0, projects that check types must [declare any missing dev dependencies](https://pgcast.dev/install#requirements) (`typescript` 4.1 or later and `@types/pg`). pgcast still reads `zapatosconfig.json`.
- From 6.7.0, a new project installs pgcast under its own name, `npm install pgcast@npm:@pgcast/pgcast` (`pnpm add pgcast@npm:@pgcast/pgcast`, `yarn add pgcast@npm:@pgcast/pgcast@^6.7`, `bun add pgcast@npm:@pgcast/pgcast@^6.7`), sets the generator's [`moduleNames: 'pgcast'`](https://pgcast.dev/generator#generate.moduleNames) in `pgcastconfig.json`, and imports `pgcast/db` and `pgcast/schema` ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)). 6.6.2 ignores the option and the file. Installed as plain `@pgcast/pgcast`, neither name resolves.
- From 6.8.0, `npx pgcast --check` compares the files the generator would write with yours and writes nothing, for CI: it exits with code 1 if one differs or is missing ([`--check`](https://pgcast.dev/generator#check)).

## What differs from Zapatos 6.6.1

- **Security.** From 6.6.2, a string can no longer close its quotes as a table or column name, a `Whereable` key, a `lateral` key or alias, or the cast of `param()`; plain `updateValues` of `upsert()` are parameters; lock, `truncate()`, isolation and aggregate keywords are checked before any query. The few 6.6.1 calls that relied on this, and their migration, are listed under `Security` in the [changelog](https://pgcast.dev/changelog#6.6.2-security). Later releases closed more holes that Zapatos 6.6.1 shares, each with its advisory: [fixes by release](https://pgcast.dev/security#fixes-by-release).
- **Fixes.** A call that Postgres already refused throws a helpful error first, such as `update()` with no columns, and a result that contradicts the function's name, type or docs changes, such as `not()`, which now negates its whole condition: each is listed under `Fixed` in the [changelog](https://pgcast.dev/changelog).
- **Opt-ins**, for surprises that code may rely on. In 6.x each is off by default; the old path emits a `DeprecationWarning` once per process, with a code to search for, except `selectExactlyOneChecksForSecondRow`'s and the generator's `domainsTypedAsUnions`, which stay opt-in for good, and the generator's others, which note through `warningListener` ([decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)).

| Option | Warning in 6.x | Introduced |
|---|---|---|
| `upsertRequiresSameKeys`: a multi-row `upsert()` throws, rather than overwrite a column with `DEFAULT` | retired in 7.0 | 6.7.0 |
| `undefinedMeansMissing`: an `undefined` value acts as a missing key, so `update()` leaves the column and `insert()` sends `DEFAULT` | retired in 7.0 | 6.7.0 |
| `transactionRequiresCommit`: a `transaction()` whose `COMMIT` Postgres answers with `ROLLBACK`, after a query error the callback caught, rejects, rather than resolve with nothing saved | `PGCAST_DEP003` | 6.7.0 |
| `aggregatesTypedByColumn`: `sum()`, `avg()`, `min()` and `max()` give `null` when no row matches, rather than `0`, and `min()` and `max()` their column's value, as parsed by `pg`. Both values and types default to this in 7.0 | `PGCAST_DEP004`, retired in 7.0 | 6.7.0 |
| `transactionRequiresIdleClient`: a `transaction()` given a client already inside a transaction block (a `BEGIN` of yours) rejects before sending its `START TRANSACTION`, rather than commit or roll back that transaction; needs pg 8.21 | `PGCAST_DEP005` | 6.7.0 |
| `transactionRequiresSatisfyingLevel`: a `transaction()` given the client of a transaction at a level that doesn't satisfy its own (`serializable()` given `readCommitted()`'s) rejects, rather than run its callback at that level | `PGCAST_DEP007` | 6.7.0 |
| `selectExactlyOneChecksForSecondRow`: a `selectExactlyOne()` run on its own throws on a second row, rather than give the first; nested in a `lateral` or a `sql` template, or as a `.copy()`, it keeps `LIMIT 1` | none | 6.7.0 |
| `typeEnumsAcrossSchemas` (generator): an enum of another schema is typed by its labels, rather than as an `any` custom type or a same-named enum of the relation's schema | a note through `warningListener` | 6.7.0 |
| `enumOrder: 'declared'` (generator): an enum's labels, `every.<name>` included, keep their declared order, by which Postgres compares them, rather than the alphabetical one | a note through `warningListener` | 6.7.0 |
| `rejectOnQueryError` (generator): a failed query, the connection included, rejects `generate()` with its error, rather than end the process with `process.exit(1)`; the CLI still exits | a note through `warningListener`, `PGCAST_DEP006` | 6.7.0 |
| `uniqueIndexConstraintsOnly` (generator): a relation's `UniqueIndex`, the names `constraint()` takes, lists only the index of each of its `UNIQUE` and `PRIMARY KEY` constraints, valid, not `DEFERRABLE` nor `WITHOUT OVERLAPS` ([generator](https://pgcast.dev/generator#generate.uniqueIndexConstraintsOnly)), rather than every unique index, some of which `ON CONFLICT ON CONSTRAINT` refuses | a note through `warningListener` | 6.7.0 |
| `domainsTypedByContext` (generator): a domain over `int8`, `numeric`, `bytea`, `money` or a date, or over an array of one, is typed by context, as its base type is, while its placeholder holds what the generator wrote ([generator](https://pgcast.dev/generator#generate.domainsTypedByContext)), rather than as `pg` returns it in all five interfaces; a domain over a domain, or an array of a domain, by the base type of its innermost domain, rather than as `any` | a note through `warningListener` | 6.7.0 |
| `enumArraysTypedAsText` (generator): an array of an enum is a `string` in `Selectable`, the text `pg` returns from a `sql` query, `'{writer,editor}'` ([generator](https://pgcast.dev/generator#generate.enumArraysTypedAsText)), rather than an array; `false` keeps the array, for a parser set with `pg.types.setTypeParser` | a note through `warningListener`, the key left out | 6.7.0 |
| `intervalsTypedAsObjects` (generator): an `interval` is typed in `Selectable` as `pg`'s default type parser returns it, a `db.PostgresInterval`, which a write takes back ([generator](https://pgcast.dev/generator#generate.intervalsTypedAsObjects)), rather than as its text; `false` keeps the text, for a type parser of your own | a note through `warningListener` | 6.7.0 |
| `domainsTypedAsUnions` (generator): a domain over `text` whose `CHECK` lists its values, `CHECK (VALUE IN ('U', 'PG'))`, is declared as their union, which a new placeholder names ([generator](https://pgcast.dev/generator#generate.domainsTypedAsUnions)), rather than typed by a placeholder that holds `string`; one already on disk stays yours | none | 6.10.0 |

Everything else: the [changelog](https://pgcast.dev/changelog); what the characterisation of 6.6.1 found: [its report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md).

## Versions

- pgcast continues Zapatos's version numbers: 6.6.2 follows Zapatos 6.6.1.
- **6.x** is a drop-in replacement for Zapatos 6.6.1: the opt-ins stay off.
- **7.0** switches the opt-in defaults of [decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md), except `selectExactlyOneChecksForSecondRow` and the generator's `domainsTypedAsUnions`, which stay opt-in for good; the warnings announce it.
  In 7.x, set `undefinedMeansMissing: false` or `upsertRequiresSameKeys: false` independently to keep the corresponding 6.x write behaviour without a warning. The three transaction checks also default to `true`. Set any one to `false` for its 6.x behaviour without a warning through 7.x.
- **8.0** removes the old paths, except those of `selectExactlyOneChecksForSecondRow` and `domainsTypedAsUnions`, and three old values asked for by choice, which stay: `rejectOnQueryError: false`, `enumArraysTypedAsText: false` and `intervalsTypedAsObjects: false` ([Versions](https://pgcast.dev/versions#_7-0-and-8-0)).
- Releases follow the [milestones](https://github.com/AlexandreDemartin/pgcast/milestones).

## Documentation

pgcast's documentation, in English and French: <https://pgcast.dev/>, built from `master`. A tutorial, how-to guides, explanations, and a reference with an entry for every export of `zapatos/db` and every option; a project on Zapatos starts at [Switch from Zapatos](https://pgcast.dev/switching).

## Roadmap

The plan lives in GitHub issues: one [epic](https://github.com/AlexandreDemartin/pgcast/issues?q=label%3A%22type%3A%20epic%22) per chapter, one sub-issue per step, each closed by its pull request. Steps come in order of how much of the last mile they cover, their value for their risk, and what they depend on.

1. Done: [Fix what the characterisation found](https://github.com/AlexandreDemartin/pgcast/issues/18): the surprises of 6.6.1, fixed outright, behind an opt-in, or documented.
2. [Type the schema and the conditions real code writes by hand](https://github.com/AlexandreDemartin/pgcast/issues/19): `--check`, conditions, domains.
3. [Run on any driver, with savepoints, RLS context and cursors](https://github.com/AlexandreDemartin/pgcast/issues/20).
4. [Infer the types of raw SQL](https://github.com/AlexandreDemartin/pgcast/issues/21).
5. Done: [Give pgcast its own documentation](https://github.com/AlexandreDemartin/pgcast/issues/85), alongside the others: a site in the spirit of Zapatos's docs, then docs that move with the code.

## Relationship with Zapatos

- pgcast is a maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1, created by [George MacKerron](https://github.com/jawj). Zapatos is his work: its design, its code and its documentation. pgcast keeps his copyright, his module names and his voice.
- Fixes made upstream are brought over when they apply; fixes found here, the security ones first, are offered upstream.
- Maintainer: [Alexandre Demartin](https://github.com/AlexandreDemartin).

## Contributing and security

- How to contribute: [CONTRIBUTING.md](https://github.com/AlexandreDemartin/pgcast/blob/master/CONTRIBUTING.md).
- To report a vulnerability, never a public issue: [Report a flaw](https://pgcast.dev/security#report-a-flaw).

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run test:types && npm run build
```

Contributor and agent guidelines: [AGENTS.md](https://github.com/AlexandreDemartin/pgcast/blob/master/AGENTS.md).

## Licence

MIT. Copyright © 2020 - 2025 George MacKerron (Zapatos); fork copyright © 2026 Alexandre Demartin. See [LICENCE](https://github.com/AlexandreDemartin/pgcast/blob/master/LICENCE).
