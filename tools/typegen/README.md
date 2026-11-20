# @pgcast/typegen

This unpublished package contains the private Postgres statement describer for pgcast's [raw SQL types](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md).

On a dedicated `pg.Client`, the describer sends Parse, Describe and Sync for one statement. Postgres returns the parameter type OIDs and, for each result field in order, its name, type OID, source table OID and attribute number. An expression can have zero for both origin fields. A command such as `DELETE` produces NoData, while `SELECT FROM films` describes a row with zero fields.

Each description runs in a read-only transaction with a one-second lock timeout. The client rolls back after a successful description or a refusal, before describing the next statement.

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
