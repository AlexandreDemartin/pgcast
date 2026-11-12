# pgcast

**Zero-abstraction Postgres for TypeScript: your types, cast from your database.**

Maintained by [Alexandre Demartin](https://github.com/AlexandreDemartin) · created as Zapatos by [George MacKerron](https://github.com/jawj)

[![CI](https://github.com/AlexandreDemartin/pgcast/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/AlexandreDemartin/pgcast/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENCE)

A maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1 by George MacKerron.

> **Status:** 6.6.2 is Zapatos 6.6.1 with its security holes closed. 6.7.0, in progress, adds opt-ins for the surprises that code may rely on. pgcast is not on npm yet.

## Why pgcast

- **Postgres is the source of the types.** The codegen reads the catalog and writes them; none is written by hand. No ORM, no models, no hidden state.
- **SQL you can read.** Each shortcut compiles to one predictable query, and the `sql` template is always there: the SQL you write is the SQL that runs.
- **Values are parameters, and names cannot break out.** Every value is sent as `$1`, `$2`, …; a table, column or key that may come from outside is quoted with its `"` doubled.
- **A drop-in for Zapatos.** Same module names, same API, the old behaviour by default: switch without touching an import.

The goal is Zapatos going the last mile. Foreign-key joins, the conditions Postgres offers, CTEs, functions and raw SQL each get a typed form, so that real code never has to fall back on `db.raw`, hand-written row types or casts.

## At a glance

George's `authors` and `books` tables, where `books."authorId"` references `authors."id"`. The TypeScript you write:

```typescript
import * as db from 'zapatos/db';
import pool from './pgPool';

const authorBooks = await db.select('authors', db.all, {
  lateral: {
    books: db.select('books', { authorId: db.parent('id') }),
  },
}).run(pool);
```

The SQL it runs, in one round trip:

```sql
SELECT coalesce(jsonb_agg(result), '[]') AS result
FROM (
  SELECT to_jsonb("authors".*) || jsonb_build_object($1::text, "lateral_books".result) AS result
  FROM "authors"
  LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(result), '[]') AS result
    FROM (
      SELECT to_jsonb("books".*) AS result
      FROM "books"
      WHERE ("authorId" = "authors"."id")
    ) AS "sq_books"
  ) AS "lateral_books" ON true
) AS "sq_authors"
-- values: ["books"]
```

The type you get, with no annotation (`s` is `zapatos/schema`, the generated module):

```typescript
const authorBooks: (s.authors.JSONSelectable & { books: s.books.JSONSelectable[] })[]
// s.authors.JSONSelectable is { id: number; name: string; isLiving: boolean | null }
```

## Install

The generated schema and the runtime still use the `zapatos/*` module names (`zapatos/db`, `zapatos/schema`). To switch an existing project **without touching a single import**, install pgcast under the `zapatos` alias (once published: pgcast is not on npm yet):

```bash
npm install zapatos@npm:pgcast
npx zapatos        # or: npx pgcast
```

- `pg`, `@types/pg` and TypeScript 4.1 or later are peer dependencies, as in Zapatos; `zapatosconfig.json` is read as before.
- Installing it as plain `npm install pgcast` breaks every `zapatos/*` import, by design for now. Native `pgcast/*` module names will come later as an opt-in ([decision 002](docs/decisions/002-module-names.md)).

## What differs from Zapatos 6.6.1

- **Security (6.6.2).** A string can no longer close its quotes as a table or column name, a `Whereable` key, a `lateral` key or alias, or the cast of `param()`; plain `updateValues` of `upsert()` are parameters; lock, `truncate()`, isolation and aggregate keywords are checked before any query. The few 6.6.1 calls that relied on this, and their migration, are listed under `Security` in the [changelog](CHANGELOG.md).
- **Fixes.** A call that Postgres already refused throws a helpful error first, such as `update()` with no columns.
- **Opt-ins**, for surprises that code may rely on. Each is off by default; the old path emits a `DeprecationWarning` once per process, with a code to search for ([decision 003](docs/decisions/003-fixes-and-deprecation.md)).

| Option | Warning | Release |
|---|---|---|
| `upsertRequiresSameKeys`: a multi-row `upsert()` throws, rather than overwrite a column with `DEFAULT` | `PGCAST_DEP001` | 6.7.0 |
| `undefinedMeansMissing`: an `undefined` value acts as a missing key, so `update()` leaves the column and `insert()` sends `DEFAULT` | `PGCAST_DEP002` | 6.7.0 |

Everything else: [CHANGELOG.md](CHANGELOG.md); what the characterisation of 6.6.1 found: [docs/CHARACTERISATION-REPORT.md](docs/CHARACTERISATION-REPORT.md).

## Versions

- pgcast continues Zapatos's version numbers: 6.6.2 follows Zapatos 6.6.1.
- **6.x** is a drop-in replacement for Zapatos 6.6.1: the opt-ins stay off.
- **7.0** switches the opt-in defaults of [decision 003](docs/decisions/003-fixes-and-deprecation.md); the warnings announce it.
- **8.0** removes the old paths.
- Releases follow the [milestones](https://github.com/AlexandreDemartin/pgcast/milestones).

## Documentation

pgcast's documentation: <https://alexandredemartin.github.io/pgcast/>, built from `master` ([Epic #85](https://github.com/AlexandreDemartin/pgcast/issues/85)). Its pages are still being written; until each is, the [Zapatos documentation](https://jawj.github.io/zapatos/) applies wherever pgcast does not differ (above, and the changelog).

## Roadmap

The plan lives in GitHub issues: one epic per chapter, one sub-issue per step, each closed by its pull request. Steps come in order of how much of the last mile they cover, their value for their risk, and what they depend on.

1. [Fix what the characterisation found](https://github.com/AlexandreDemartin/pgcast/issues/18): the surprises of 6.6.1, fixed outright, behind an opt-in, or documented.
2. [Type the schema and the conditions real code writes by hand](https://github.com/AlexandreDemartin/pgcast/issues/19): `--check`, conditions, foreign keys, domains, functions, CTEs.
3. [Run on any driver, with savepoints, RLS context and cursors](https://github.com/AlexandreDemartin/pgcast/issues/20).
4. [Infer the types of raw SQL](https://github.com/AlexandreDemartin/pgcast/issues/21).
5. [Give pgcast its own documentation](https://github.com/AlexandreDemartin/pgcast/issues/85), alongside the others: a site in the spirit of George's docs, then docs that move with the code.

## Relationship with Zapatos

- Zapatos is George MacKerron's work: its design, its code and its documentation. pgcast keeps his copyright, his module names and his voice.
- Fixes made upstream are brought over when they apply; fixes found here, the security ones first, are offered upstream.
- Maintainer: [Alexandre Demartin](https://github.com/AlexandreDemartin). George MacKerron is the original author of Zapatos.

## Contributing and security

- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md).
- To report a vulnerability, never a public issue: [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run test:types && npm run build
```

Contributor and agent guidelines: [AGENTS.md](AGENTS.md).

## Licence

MIT. Copyright © 2020 - 2025 George MacKerron (Zapatos); fork copyright © 2026 Alexandre Demartin. See [LICENCE](LICENCE).
