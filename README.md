# pgcast: zero-abstraction Postgres for TypeScript

**pgcast** is a maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1 by George MacKerron.

Your TypeScript types are *cast* from your database: Postgres is the single source of truth, the types are generated from its catalog, and the SQL you write is the SQL that runs. No ORM, no models, no hidden state.

> **Status:** fork setup (phase 0). Behaviour is identical to Zapatos 6.6.1. See the [roadmap](docs/ROADMAP.md).

## Drop-in replacement for Zapatos

The generated schema and the runtime still use the `zapatos/*` module names (`zapatos/db`, `zapatos/schema`). To switch an existing project **without touching a single import**, install pgcast under the `zapatos` alias:

```bash
npm install zapatos@npm:pgcast
npx zapatos        # or: npx pgcast
```

Native `pgcast/*` module names are being discussed in [decision 002](docs/decisions/002-noms-de-modules.md).

## Documentation

Until pgcast has its own docs, the [Zapatos documentation](https://jawj.github.io/zapatos/) applies in full.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run test:types && npm run build
```

Contributor and agent guidelines: [AGENTS.md](AGENTS.md).

## Licence

MIT. Copyright © 2020 - 2025 George MacKerron (Zapatos); fork copyright © 2026 Alexandre Demartin. See [LICENCE](LICENCE).
