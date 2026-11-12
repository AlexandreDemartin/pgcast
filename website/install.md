# Install

pgcast keeps Zapatos's module names, so you install it under the `zapatos` alias. Nothing in your imports changes.
{.lede}

::: info Not on npm yet
pgcast hasn't had its first release. These commands will work once it has; until then, the [README](https://github.com/AlexandreDemartin/pgcast#readme) says where things stand.
:::

## Requirements

- Postgres. The test suite runs against 14, 16 and 18.
- Node, and `pg` (node-postgres), with `@types/pg` for TypeScript.
- TypeScript 5.7 or later. `@types/pg` brings in `@types/node` and `pg-protocol`, whose types now need it; so does [`toBuffer()`](/runtime-config#toBuffer)'s, `Buffer<ArrayBuffer>`, as in Zapatos 6.6.1.

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
`skipLibCheck` skips your generated `schema.d.ts` too. After an upgrade of pgcast, a schema you haven't regenerated no longer fails on `schemaVersionCanary` ([When the schema changes](/first-query#when-the-schema-changes)): run `npx pgcast` each time.
:::

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

That's pgcast in your project. Next, [Your first typed query](/first-query) generates the types of a database, then runs a select and an insert with them.

Working with an assistant? It can read these docs from [llms.txt](/llms.txt), an index of the pages, or [llms-full.txt](/llms-full.txt), all of them in one file.
