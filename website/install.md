# Install

From 6.7.0, you install pgcast under its own name and import `pgcast/db`. A project switching from Zapatos installs it under the `zapatos` alias instead, and keeps its imports.
{.lede}

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

### Under its own name

::: code-group

```sh [npm]
npm install pgcast@npm:@pgcast/pgcast pg
npm install --save-dev @types/pg
```

```sh [pnpm]
pnpm add pgcast@npm:@pgcast/pgcast pg
pnpm add -D @types/pg
```

```sh [yarn]
yarn add pgcast@npm:@pgcast/pgcast@^6.7 pg
yarn add -D @types/pg
```

```sh [bun]
bun add pgcast@npm:@pgcast/pgcast@^6.7 pg
bun add -d @types/pg
```

:::

Then set `"moduleNames": "pgcast"` in `pgcastconfig.json`, the generator's config file ([The CLI](/generator#cli)), and import `pgcast/db` and `pgcast/schema` ([`moduleNames`](/generator#generate.moduleNames)).

Yarn 2 and later need a version range in an alias, and Yarn 1 and bun before 1.4 write none without one: hence the `@^6.7`, the first release with `moduleNames`.

::: info Coming
6.7.0 isn't on npm yet: 6.6.2 reads only `zapatosconfig.json`, ignores `moduleNames` and writes `zapatos/`, and the yarn and bun commands find no version. Until then, install under the `zapatos` alias ([the milestone](https://github.com/AlexandreDemartin/pgcast/milestone/1)).
:::

### Under the `zapatos` alias

For a project switching from Zapatos, whose imports stay `zapatos/*`, and for a new one until 6.7.0:

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast pg
npm install --save-dev @types/pg
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast pg
pnpm add -D @types/pg
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6 pg
yarn add -D @types/pg
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6 pg
bun add -d @types/pg
```

:::

Here any 6.x will do: `@^6`.

::: tip Why the alias
Your imports and the generated schema name the package by its folder in `node_modules`: `pgcast/db` or `zapatos/db`. Installed as plain `@pgcast/pgcast`, it lands in `node_modules/@pgcast/pgcast`, where neither resolves. The alias names the folder, and `moduleNames` must match it ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

Already on Zapatos? Switching is one line of `package.json`, then a look for the few calls whose result changes: [Switch from Zapatos](/switching).

That's pgcast in your project. Next, [First query](/first-query) generates the types of a database, then runs a select and an insert with them.

Working with an assistant? It can read these docs from [llms.txt](/llms.txt), an index of the pages, or [llms-full.txt](/llms-full.txt), all of them in one file.
