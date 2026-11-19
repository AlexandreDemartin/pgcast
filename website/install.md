# Install

From 6.7.0, you install pgcast under its own name and import `pgcast/db`. A project switching from Zapatos [installs 6.x under the `zapatos` alias](/switching#swap-the-package), and keeps its imports.
{.lede}

## Requirements

- Postgres. The test suite runs against 14, 16 and 18.
- Node and `pg` (node-postgres) to run queries and the generator in JavaScript.
- From 7.0.0. The type peers `typescript` and `@types/pg` are optional. Add them to your `devDependencies` to check types. Use TypeScript 5.7 or later to check the declarations of `@types/node` and `pg-protocol`, which `@types/pg` brings in, and the return type of [`toBuffer()`](/runtime-config#toBuffer), `Buffer<ArrayBuffer>`.

::: code-group

```sh [npm]
npm install --save-dev typescript @types/pg
```

```sh [pnpm]
pnpm add -D typescript @types/pg
```

```sh [yarn]
yarn add -D typescript @types/pg
```

```sh [bun]
bun add -d typescript @types/pg
```

:::

### On an older TypeScript

pgcast's own types go back to TypeScript 4.1, the first with template literal types. Below 5.7, tell TypeScript not to check the types in `node_modules` (`toBuffer()` then returns `any`):

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

:::

- From 5.0, that's all.
- Below 5.0, TypeScript can't read today's `@types/node`. Install the one made for your version, by its tag, and pin it: here for 4.1, `ts4.9` for 4.9.

```sh
npm install --save-dev --save-exact @types/node@ts4.1
```

::: warning Stale schema
`skipLibCheck` skips your generated `schema.d.ts` too. After an upgrade of pgcast, a schema you haven't regenerated no longer fails on `schemaVersionCanary` ([When the schema changes](/first-query#when-the-schema-changes)): run `npx pgcast` each time, and [`npx pgcast --check`](/generator#check) in CI, which fails while a generated file is stale.
:::

## Add the package

For 7.x, use `@^7` wherever a Yarn or bun command below specifies a 6.x alias range.

### Under its own name

::: code-group

```sh [npm]
npm install pgcast@npm:@pgcast/pgcast pg
```

```sh [pnpm]
pnpm add pgcast@npm:@pgcast/pgcast pg
```

```sh [yarn]
yarn add pgcast@npm:@pgcast/pgcast@^6.7 pg
```

```sh [bun]
bun add pgcast@npm:@pgcast/pgcast@^6.7 pg
```

:::

Then set `"moduleNames": "pgcast"` in `pgcastconfig.json`, the generator's config file ([The CLI](/generator#cli)), and import `pgcast/db` and `pgcast/schema` ([`moduleNames`](/generator#generate.moduleNames)).

Yarn 2 and later need a version range in an alias, and Yarn 1 and bun before 1.4 write none without one: hence the `@^6.7`, the first release with `moduleNames`.

### Under the `zapatos` alias

Starting from Zapatos 6.6.1? Use the [commands pinned to 6.x](/switching#swap-the-package) to see its migration warnings. Already on pgcast 6.x? Follow the [7.0 migration guide](/switching#from-7-0).

::: tip Why the alias
Your imports and the generated schema name the package by its folder in `node_modules`: `pgcast/db` or `zapatos/db`. Installed as plain `@pgcast/pgcast`, it lands in `node_modules/@pgcast/pgcast`, where neither resolves. The alias names the folder, and `moduleNames` must match it ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

That's pgcast in your project. Next, [First query](/first-query) generates the types of a database, then runs a select and an insert with them.

Working with an assistant? It can read these docs from [llms.txt](/llms.txt), an index of the pages, or [llms-full.txt](/llms-full.txt), all of them in one file.
