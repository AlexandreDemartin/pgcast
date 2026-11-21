# @pgcast/typegen

`pgcast-typegen` asks Postgres to describe named SQL queries without executing them. It writes their row types to `queries.ts` beside the generated schema.

In your TypeScript project, install the core and the tool.

```sh
npm install pgcast@npm:@pgcast/pgcast pg
npm install --save-dev @pgcast/typegen
```

The tool reads your sources with the JavaScript API of TypeScript 4.1 to 6, from the `typescript` that the `--project` tsconfig resolves. TypeScript 7 has none, and the tool then stops with `typescript 7.0.2 from <tsconfig> has no JavaScript API`. On TypeScript 7, install the tool in a folder of its own with `typescript@6` and the same `@pgcast/pgcast` version as your application's:

```sh
npm install --save-dev --prefix typegen @pgcast/typegen @pgcast/pgcast pg typescript@6
```

Give that folder a `tsconfig.json`, `typegen/tsconfig.json`, that extends the project's, then run the tool from the project root with it as `--project`. TypeScript 7 still compiles the application.

```json
{ "extends": "../tsconfig.json" }
```

```sh
typegen/node_modules/.bin/pgcast-typegen --project typegen/tsconfig.json
```

Set `"moduleNames": "pgcast"` in `pgcastconfig.json`. When switching from Zapatos, install `zapatos@npm:@pgcast/pgcast` instead, keep the default module names and use `zapatos` in the import paths below.

For a worked example, see [Typed SQL](https://pgcast.dev/typed-sql).

Import `Row` from the file the command will write and give the query a name.

```ts
import * as db from 'pgcast/db';
import type { Row } from './pgcast/queries';

export const films = db.sql<never, Row<'films'>[]>`SELECT title FROM films`;
```

```sh
npx pgcast-typegen
```

The command scans `./tsconfig.json`, or the file given by `--project <tsconfig>`. From the working directory it reads `pgcastconfig.json`, falls back to `zapatosconfig.json`, then to the schema generator's defaults. String values expand `{{NAME}}` from the environment. Use `db` for pg connection settings or use pg's environment variables. Omit `query_timeout` so the describer can finish its rollback.

The file is `<outDir>/zapatos/queries.ts` by default. With `moduleNames: "pgcast"`, use `pgcast/db` and `<outDir>/pgcast/queries.ts`. A failed run preserves the previous file.

Named templates can interpolate a string literal as an identifier, `param(value, 'int4')` as `CAST($n AS "int4")`, or `param(value, false)` as `$n`. An identifier or cast can also use a template literal without substitutions. Import `sql` and `param` by name or through a namespace from `zapatos/db` or `pgcast/db`. Both must resolve to the same db installation.

Static templates use their cooked SQL directly. For interpolated templates, the application's `@pgcast/pgcast` compiler and db import must match the generator's peer version. Value expressions stay unevaluated.

For `param(value)` and `param(value, true)`, the value and run-time settings can produce either `$n` or `CAST($n AS "json")`. The tool describes every combination of up to four such slots. For five or more, give slots a literal cast or `false` until at most four remain. Other interpolations need a hand-written row.

The tool drops a form only if Parse returns `42883`, `42804`, `42846`, `42725` or `42P18`. This assumes the application and CLI resolve names with the same `search_path` and role and no temporary objects.

At least one form must parse, and all successful forms must agree on field names, order, types and nullability. The stored text is the first successful form, starting with all slots plain and toggling the first ambiguous slot fastest.

Field types follow pg's default text parsers. In the CLI and application sessions, `date`, `timestamp` and `timestamptz` require `DateStyle=ISO`, and `interval` requires `IntervalStyle=postgres`. This includes their arrays. A scalar enum column on an included relation uses its verified labels.

A field admits `null` unless its origin and every descendant are ordinary or partitioned tables without rewrite rules, with the same column marked `NOT NULL`. On Postgres 18 and later, each constraint must also be enforced and validated. A guard word or `U&` anywhere in the SQL makes every field nullable, regardless of case, even in a literal, quoted identifier or comment. [Decision 012 lists the guard words.](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md#2-nullability)

## Narrow a nullable column

Use `NotNull` when you know the decoded field is never `null`. A SQL guarantee is not always enough: pg decodes the JSON value `null` to `null`, so `COALESCE(payload, 'null'::jsonb)` can still give `null`. Here `COALESCE` makes `runtime_minutes` a `number` in every result row.

```ts
import { param, sql } from 'pgcast/db';
import type * as s from 'pgcast/schema';
import type { NotNull, Row } from './pgcast/queries';

export const filmsByStudio = (studioId: number) =>
  sql<s.films.SQL, NotNull<Row<'films-by-studio'>, 'runtime_minutes'>[]>`
    SELECT title, COALESCE(runtime_minutes, 0) AS runtime_minutes
    FROM films WHERE studio_id = ${param(studioId, 'int4')}`;
```

You vouch for each named column. For an array column, check its dimensions and nullable elements before using them.

## Check committed rows

Commit the generated `queries.ts`. In CI, install the tool and its peers, then run the check.

```sh
npx --no-install pgcast-typegen --check
```

With no `db` in the config, the check runs offline, even when pg environment variables are set. It compares query names and neutralised SQL with the committed text, where any form of a query with several forms matches, and the file's bytes with what the tool writes from the entries it reads. Row types are not checked.

To check row types too, point `db` at the migrated database. The tool describes the queries again and compares the generated bytes with the committed file. A connection failure fails the check.

Both modes accept `--project <tsconfig>` and leave the file untouched. Exit 0 means the file passed the selected check. Exit 1 reports drift or an error. Regenerate after a reported difference.

## Watch for edits

From 0.2.0.

```sh
npx pgcast-typegen --watch [--project <tsconfig>]
```

The command generates once, then regenerates `queries.ts` each time a source file of the project changes, until `SIGINT` or `SIGTERM` closes it with exit 0. It follows the project and its references through the project's own TypeScript and keeps one connection to `db`. It describes only the queries whose text changed since the last round, and writes the file only when its bytes change. It prints a line when it writes, and the errors of a failing round, then keeps watching. A lost connection exits 1.

The schema is not watched. After a migration, one run without `--watch` is enough: a running `--watch` sees the file change and describes every query again, so it keeps the new rows. The config file is read once: restart `--watch` after editing it. `--watch` cannot be combined with `--check`.

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
