# @pgcast/typegen

Version 0.1.0 is unpublished. `pgcast-typegen` asks Postgres to describe named SQL queries without executing them. It writes their row types to `queries.ts` beside the generated schema.

Import `Row` from the file the command will write and give the query a name.

```ts
import * as db from 'zapatos/db';
import type { Row } from './zapatos/queries';

export const films = db.sql<never, Row<'films'>[]>`SELECT title FROM films`;
```

```sh
pgcast-typegen
```

The command scans `./tsconfig.json`, or the file given by `--project <tsconfig>`. From the working directory it reads `pgcastconfig.json`, falls back to `zapatosconfig.json`, then to the schema generator's defaults. String values expand `{{NAME}}` from the environment. Use `db` for pg connection settings or use pg's environment variables. Omit `query_timeout` so the describer can finish its rollback.

The file is `<outDir>/zapatos/queries.ts` by default. With `moduleNames: "pgcast"`, use `pgcast/db` and `<outDir>/pgcast/queries.ts`. A failed run preserves the previous file.

Only static templates qualify. Field types follow pg's default text parsers. Postgres's statement description gives no nullability guarantee, so every field currently admits `null`. [Origin-based nullability is tracked in #805.](https://github.com/AlexandreDemartin/pgcast/issues/805)

## Development

Build the root package first, then run the tests against the repository's [test database](https://github.com/AlexandreDemartin/pgcast/blob/master/AGENTS.md#local-environment).

```sh
npm ci && npm run build
cd tools/typegen
npm ci
npm run lint && npm run typecheck && npm run build
npm test
npm run test:types
npm pack --dry-run --json
```

CI runs the suite with pg 8.6.0 and the lockfile's pg on Postgres 14, 16, 18 and 19.
