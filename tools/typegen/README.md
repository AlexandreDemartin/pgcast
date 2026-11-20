# @pgcast/typegen

Version 0.1.0 is unpublished. It contains the private Postgres statement describer and its protocol tests for pgcast's [raw SQL types](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md). The command to generate result types comes in [#804](https://github.com/AlexandreDemartin/pgcast/issues/804).

## Development

Build the root package first, then run the protocol suite against the repository's [test database](https://github.com/AlexandreDemartin/pgcast/blob/master/AGENTS.md#local-environment).

```sh
npm ci && npm run build
cd tools/typegen
npm ci
npm run lint && npm run typecheck && npm run build
npm test
npm pack --dry-run --json
```

CI runs the suite with pg 8.6.0 and the lockfile's pg on Postgres 14, 16, 18 and 19.
