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

That's pgcast in your project. Next, [Your first typed query](/first-query) generates the types of a database, then runs a select and an insert with them.

Working with an assistant? It can read these docs from [llms.txt](/llms.txt), an index of the pages, or [llms-full.txt](/llms-full.txt), all of them in one file.
