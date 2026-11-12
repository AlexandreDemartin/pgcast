# Install

pgcast keeps Zapatos's module names, so you install it under the `zapatos` alias. Nothing in your imports changes.
{.lede}

::: info Not on npm yet
pgcast hasn't had its first release. These commands will work once it has; until then, the [README](https://github.com/AlexandreDemartin/pgcast#readme) says where things stand.
:::

## Requirements

- Postgres. The test suite runs against 14, 16 and 18.
- Node, and `pg` (node-postgres), with `@types/pg` for TypeScript.
- TypeScript 4.1 or later: the generated types use template literal types.

## Add the package

::: code-group

```sh [npm]
npm install zapatos@npm:pgcast pg
npm install --save-dev @types/pg
```

```sh [pnpm]
pnpm add zapatos@npm:pgcast pg
pnpm add -D @types/pg
```

```sh [yarn]
yarn add zapatos@npm:pgcast pg
yarn add -D @types/pg
```

:::

::: tip Why the alias
The generated schema and the run-time code talk about `zapatos/db` and `zapatos/schema`. Installed as plain `pgcast`, those imports wouldn't resolve. Native `pgcast/*` names will come later, as an opt-in ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

## Your first query

Point the generator at your database, then import the run-time code and the generated types. The examples in these docs use a small schema of a film's cast: `films`, `actors`, the `roles` between them, and the `cinemas` that screen them.

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src"
}
```

:::

<code v-pre>{{DATABASE_URL}}</code> is filled in from the environment, so the connection string stays out of your repository.

::: code-group

```sh [Terminal]
npx pgcast   # or: npx zapatos
# writes src/zapatos/schema.d.ts and src/zapatos/custom/
```

:::

::: code-group

```ts twoslash [src/films.ts]
import * as db from 'zapatos/db';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

:::

Then ask for a film. Here's what you write, the SQL it becomes, and the type of what comes back, straight from your schema:

<CastPanel example="install">

<<< ./examples/install.ts{ts twoslash}

</CastPanel>

That's it: one query, one round trip, and a result typed from the table it came from. Change a column, run the generator again, and TypeScript points at every query that no longer fits.

Working with an assistant? It can read these docs from [llms.txt](/llms.txt), an index of the pages, or [llms-full.txt](/llms-full.txt), all of them in one file.
