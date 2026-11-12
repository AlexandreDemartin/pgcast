# pgcast: zero-abstraction Postgres for TypeScript

**pgcast** is a maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1 by George MacKerron.

Your TypeScript types are *cast* from your database: Postgres is the single source of truth, the types are generated from its catalog, and the SQL you write is the SQL that runs. No ORM, no models, no hidden state.

The goal is Zapatos going the last mile. Foreign-key joins, the conditions Postgres offers, CTEs, functions and raw SQL each get a typed form, so that real code never has to fall back on `db.raw`, hand-written row types or casts.

> **Status:** fixing what the characterisation found. Behaviour is identical to Zapatos 6.6.1, but for security fixes. See the [roadmap](#roadmap).

## Drop-in replacement for Zapatos

The generated schema and the runtime still use the `zapatos/*` module names (`zapatos/db`, `zapatos/schema`). To switch an existing project **without touching a single import**, install pgcast under the `zapatos` alias (once published: pgcast is not on npm yet):

```bash
npm install zapatos@npm:pgcast
npx zapatos        # or: npx pgcast
```

Installing it as plain `npm install pgcast` breaks every `zapatos/*` import, by design for now. Native `pgcast/*` module names will come later as an opt-in ([decision 002](docs/decisions/002-module-names.md)).

## Roadmap

The plan lives in GitHub issues: one epic per chapter, one sub-issue per step, each closed by its pull request. Steps come in order of how much of the last mile they cover, their value for their risk, and what they depend on. Releases follow the [milestones](https://github.com/AlexandreDemartin/pgcast/milestones).

1. [Fix what the characterisation found](https://github.com/AlexandreDemartin/pgcast/issues/18): the surprises of 6.6.1, fixed outright, behind an opt-in, or documented.
2. [Type the schema and the conditions real code writes by hand](https://github.com/AlexandreDemartin/pgcast/issues/19): `--check`, conditions, foreign keys, domains, functions, CTEs.
3. [Run on any driver, with savepoints, RLS context and cursors](https://github.com/AlexandreDemartin/pgcast/issues/20).
4. [Infer the types of raw SQL](https://github.com/AlexandreDemartin/pgcast/issues/21).

## Documentation

Until pgcast has its own docs, the [Zapatos documentation](https://jawj.github.io/zapatos/) applies in full.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run test:types && npm run build
```

Contributor and agent guidelines: [AGENTS.md](AGENTS.md).
How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, never a public issue: [SECURITY.md](SECURITY.md).

## Licence

MIT. Copyright © 2020 - 2025 George MacKerron (Zapatos); fork copyright © 2026 Alexandre Demartin. See [LICENCE](LICENCE).
