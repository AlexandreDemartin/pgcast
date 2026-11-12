# Your first typed query

By the end of this page, you'll have generated the types of a database, asked it for films and added one, with the SQL and the type of each query in front of you. It starts where [Install](/install) stops: pgcast and `pg` in your project.
{.lede}

## Before you start

- pgcast installed under the `zapatos` alias, with `pg` and `@types/pg`: [Install](/install).
- TypeScript 5.7 or later in your project: `npm install --save-dev typescript`.
- Node 22.18 or later, which runs a TypeScript file as it is, stripping its types.
- An empty Postgres database you can connect to, its connection string in the `DATABASE_URL` environment variable, and `psql`, Postgres's command-line client.
- The films of these docs in it: [`schema.sql`](https://github.com/AlexandreDemartin/pgcast/blob/master/website/schema.sql) holds `studios`, their `films`, the `actors` and the `roles` they play, and a few more tables, with some rows to query. Download it and load it:

```sh
curl -O https://raw.githubusercontent.com/AlexandreDemartin/pgcast/master/website/schema.sql
psql "$DATABASE_URL" -f schema.sql
```

Every example below runs on that schema. A database of your own works too: swap in your table and column names as you go.

## Set up the project

The examples use `import` and a top-level `await`, so your project is an ES module:

```sh
npm pkg set type=module
```

Then a `tsconfig.json` that compiles them as Node runs them:

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2022",
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

:::

- `"module": "nodenext"` makes `import pg from 'pg'` and the top-level `await` compile, as in a `"type": "module"` project.
- `strict` turns on `strictNullChecks`, which the generated types need. Without it, a query that names its `columns` (as one does below) gets the type of every column, and a missing row stops showing up as `undefined`.
- `noEmit`: `tsc` only checks your code; Node runs the `.ts` file itself.
- The generator writes ordinary `.d.ts` files into your source tree, and `zapatos/schema` is declared in one of them, so they must be part of your compilation. With `"include": ["src"]` and the `outDir` below, they are.

## Configure the generator

Add `zapatosconfig.json` at the root of your project, where you'll run the generator:

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src"
}
```

:::

- `db` takes what you'd give `new pg.Pool()`.
- `outDir` is where the `zapatos` folder goes; without it, the folder you run the generator in.
- <code v-pre>{{DATABASE_URL}}</code> is filled in from the environment, so the connection string stays out of your repository. If the variable isn't set, the generator stops with `Error: If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist: Environment variable 'DATABASE_URL' is not set`.

Every other option, from the schemas to include to per-column settings, is in [The generator: config and CLI](/generator).

## Generate the types

Run the generator. It's installed under both names, `pgcast` and `zapatos`:

```sh
npx pgcast
```

It prints a line for each placeholder it writes, here for the docs schema's two types that Postgres alone can't describe to TypeScript:

```txt
Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts
Writing new custom type or domain placeholder file: src/zapatos/custom/PgSeat_label.d.ts
```

And you have:

```txt
src/zapatos/
├── schema.d.ts            every table, written again on each run: don't edit it
└── custom/
    ├── index.d.ts         written again on each run too
    ├── PgPoint.d.ts       cinemas.location, a POINT: any, until you say otherwise
    └── PgSeat_label.d.ts  seat_bookings.seat, the seat_label domain: string
```

The placeholders in `custom/` are yours: the generator writes each one once and never overwrites it, while `index.d.ts` is written again on each run. In `schema.d.ts`, each table is a namespace of types, and the shortcuts pick the right one for you:

| Type | What it describes | Used by |
|---|---|---|
| `films.Selectable` | a row, as `pg` returns it | your own `sql` queries |
| `films.JSONSelectable` | a row that came back as JSON: here the same, but a `timestamptz`, for one, arrives as a string, not a `Date` ([why](/catalog-types)) | the results of `select()`, `insert()` and the other shortcuts |
| `films.Whereable` | a filter: any columns, each with a value | the `where` of `select()`, `selectOne()`, `update()`, `deletes()` |
| `films.Insertable` | a new row: the `NOT NULL` columns with no default required, the rest optional | `insert()`, `upsert()` |
| `films.Updatable` | changes to a row: every column optional | `update()`, `upsert()` |

## Connect

The run-time code never opens a connection of its own: each query runs on the pool or client you give it. Import the run-time code and make a pool:

::: code-group

```ts twoslash [src/films.ts]
import * as db from 'zapatos/db';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,  // so the script ends once its queries are done
});
```

:::

The examples below carry on in this file. Their top-level `await` needs ESM: that's the `"type": "module"` above. After each step, run it:

```sh
node src/films.ts
```

And check its types with `npx tsc`, as your editor does while you type.

## Ask for one film

Ask for a film by its title with `selectOne()`, then `.run()` it on the pool:

<CastPanel example="first-query">

<<< ./examples/first-query.ts{ts twoslash}

</CastPanel>

The title went to Postgres as a parameter, `$1`, never pasted into the SQL. The row comes back as JSON (`to_jsonb`), so its type is `films.JSONSelectable`, and `undefined` if no film has that title. TypeScript won't let you forget it:

```ts twoslash
// @errors: 18048
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const film = await db.selectOne('films', { title: 'The Salt Orchard' }).run(pool);
// ---cut---
console.log(film.release_year);
```

Check for it instead, and the type narrows to the row (hover `film` to see). Run the file, and it prints `1974`:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const film = await db.selectOne('films', { title: 'The Salt Orchard' }).run(pool);
// ---cut---
if (film) console.log(film.release_year);  // 1974
```

To see the SQL in your own code, call `.compile()` where you'd call `.run()`: it gives the `text` (on one line) and `values` the panel shows, and sends nothing. Add this line to the file:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
console.log(db.selectOne('films', { title: 'The Salt Orchard' }).compile());
```

Run it, and after `1974` it prints:

```txt
{
  text: 'SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("title" = $1) LIMIT $2',
  values: [ 'The Salt Orchard', 1 ]
}
```

## Ask for several, and only what you need

`select()` gives every matching row, in an array. Ask for the films of one studio, oldest first, and name the two columns you want:

<CastPanel example="first-query-columns">

<<< ./examples/first-query-columns.ts{ts twoslash}

</CastPanel>

Each column name shows up twice: as a value, `$1`, the key of the JSON object, and quoted, `"title"`, the column it reads. The type follows the query: two columns asked for, two in the type. Leave `columns` out and you get every column, `films.JSONSelectable[]`. Print them:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title', 'release_year'],
  order: { by: 'release_year', direction: 'ASC' },
}).run(pool);
// ---cut---
console.log(films);
```

Run the file again, and after the year and the SQL it prints:

```txt
[
  { title: 'The Salt Orchard', release_year: 1974 },
  { title: "The Cartographer's Silence", release_year: 2008 }
]
```

With no matching film, the array is empty: `select()` never gives `undefined`.

## Add a film

`insert()` takes a `films.Insertable` and gives back the row as Postgres stored it. Type the row first, with the schema's types. Add this import at the top of the file, with the other two:

```ts twoslash
import type * as s from 'zapatos/schema';
```

Then the row and the query:

<CastPanel example="first-query-insert">

<<< ./examples/first-query-insert.ts{ts twoslash}

</CastPanel>

`newFilm` is a `films.JSONSelectable`, the row type `selectOne()` gave. The row's `films.Insertable` asks for the `NOT NULL` columns with no default and leaves the others optional; typed on its own, the row gets errors that name the column at fault. Print the new film:

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const row: s.films.Insertable;
const newFilm = await db.insert('films', row).run(pool);
// ---cut---
console.log(newFilm);
```

Run the file, and it prints the new row:

```txt
{
  id: 1,
  title: 'The Night Ferry to Orkesund',
  genres: [],
  tagline: null,
  studio_id: 1002,
  release_year: 2024,
  runtime_minutes: 117
}
```

The columns you left out took their defaults: the new `id` from its sequence, `genres` as `[]`, `tagline` as `null`. On a freshly loaded docs schema, the first film you add gets the `id` 1, as the seeded films start at 1000; each run after that adds it again, with the next `id`.

A `NOT NULL` column with no default can't be left out. Forget the running time, and TypeScript says so before Postgres can:

```ts twoslash
// @errors: 2741
import type * as s from 'zapatos/schema';
// ---cut---
const row: s.films.Insertable = {
  studio_id: 1002,
  title: 'The Night Ferry to Orkesund',
  release_year: 2024,
};
```

::: tip Opt-in
Leave a key out to get its column's default. A key set to `undefined` is sent as `NULL`, as in Zapatos 6.6.1, and pgcast warns once (`PGCAST_DEP002`). With `db.setConfig({ undefinedMeansMissing: true })`, it counts as left out; that's the default from 7.0 ([Versions, opt-ins and warnings](/versions)).
:::

With the running time back in the row, here is your whole file, the steps of this page in order:

::: code-group

```ts twoslash [src/films.ts]
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,  // so the script ends once its queries are done
});

const film = await db.selectOne('films', {
  title: 'The Salt Orchard',
}).run(pool);
if (film) console.log(film.release_year);  // 1974
console.log(db.selectOne('films', { title: 'The Salt Orchard' }).compile());

const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title', 'release_year'],
  order: { by: 'release_year', direction: 'ASC' },
}).run(pool);
console.log(films);

const row: s.films.Insertable = {
  studio_id: 1002,
  title: 'The Night Ferry to Orkesund',
  release_year: 2024,
  runtime_minutes: 117,
};
const newFilm = await db.insert('films', row).run(pool);
console.log(newFilm);
```

:::

## When the schema changes

Run `npx pgcast` again after each migration. `schema.d.ts` is written afresh, and TypeScript checks every query against it. Try it: rename a column, regenerate, and check the file:

```sh
psql "$DATABASE_URL" -c 'ALTER TABLE films RENAME runtime_minutes TO minutes'
npx pgcast
npx tsc
```

The row names `runtime_minutes`, which `films.Insertable` no longer has, so it stops compiling:

```txt
src/films.ts:26:3 - error TS2353: Object literal may only specify known properties, and 'runtime_minutes' does not exist in type 'Insertable'.

26   runtime_minutes: 117,
     ~~~~~~~~~~~~~~~


Found 1 error in src/films.ts:26
```

Any query that names the column stops compiling too, until you write `minutes` instead. Here, rename it back, so the rest of these docs run as written:

```sh
psql "$DATABASE_URL" -c 'ALTER TABLE films RENAME minutes TO runtime_minutes'
npx pgcast
npx tsc
```

This time `tsc` prints nothing: every query fits the schema again.

After you upgrade pgcast, a type error on `schemaVersionCanary` in `schema.d.ts` means the same thing: the generated format has changed, so run the generator again.

## What you've learnt

- Point the generator at a database, and find its types in `zapatos/schema`.
- Ask for one row with `selectOne()`, several with `select()`, and only some columns with `columns`.
- Add a row with `insert()`, and get it back as Postgres stored it.
- Read the SQL a query runs with `.compile()`, and its type under your cursor.
- Regenerate after a migration, and let TypeScript find the queries that no longer fit.

Next: a task of your own in the [how-to guides](/guides), every option in the [reference](/reference), and why it works this way in the [explanations](/explanation).
