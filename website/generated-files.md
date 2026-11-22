# Generated files

The files the generator writes and what each holds, the canary that checks their format, and how to type several databases.
{.lede}

## The files it writes {#the-files-it-writes}

```txt
src/zapatos/
├── schema.d.ts            written again on each run
└── custom/
    ├── index.d.ts         written again on each run
    ├── PgPoint.d.ts       written once, if it is not there
    └── PgSeat_label.d.ts  written once, if it is not there
```

<div class="stack">

| File | Written | Holds |
|---|---|---|
| `schema.d.ts` | on each run | `declare module 'zapatos/schema'`: a namespace per relation, its `Table`, `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`, `UniqueIndex`, `Column`, `OnlyCols`, `SQLExpression` and `SQL`; each enum, and its tuple `every.<name>`; `Schema` and the tuple `AllSchemas`; per schema and over all of them, the unions (`Table`, `Selectable`…) and the tuples `AllBaseTables`, `AllForeignTables`, `AllViews`, `AllMaterializedViews` and `AllTablesAndViews`; the `*ForTable<T>` lookups; the version canary |
| `custom/index.d.ts` | on each run, when there is a custom type | an empty `declare module 'zapatos/custom'` |
| `custom/<Name>.d.ts` | once: never overwritten | a placeholder, `export type PgSeat_label = string;`, yours to edit |

</div>

- A placeholder holds the `Selectable` type of the domain's base type: `string` for `seat_label`, a `text`; `Date` for a `date` domain; `db.JSONValue` for a `json` or `jsonb` one, with its `import type * as db from 'zapatos/db'`. A type the generator can't map (`point`) gets `any`. How to fill one in: [Custom types](/custom-types).
- A base type mapped to another `db.*` type (`int8`, `numeric`, `time`, ranges…) gets the same import: `export type PgTicket_no = db.Int8String;` comes with `import type * as db from 'zapatos/db';`. A domain over an enum imports it: `import type { genre } from 'zapatos/schema';` above `export type PgGenre_d = genre;`. Zapatos 6.6.1 imported `db` for `db.JSONValue` alone, so its placeholders over these failed to compile ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)): [When a placeholder does not compile](/custom-types#when-a-placeholder-does-not-compile).
- Nothing is deleted: a placeholder whose type is gone stays, and so does `custom/` once there is no custom type left.
- `schema.d.ts` declares `schemaVersionCanary`, `version: 104`. A `zapatos/db` that expects another version fails to compile there: generate again ([`SchemaVersionCanary`](#SchemaVersionCanary)).
- Each file is a `declare module` of the `zapatos/*` names, so your `tsconfig.json` must include it: `"include": ["src"]`, with `outDir` `"./src"`.
- With [`moduleNames`](/generator#generate.moduleNames) `"pgcast"`, the tree is `src/pgcast/` and the names `pgcast/*`; the rest of this section is the same.

### The old layout warning {#the-old-layout-warning}

Zapatos before 3.0 copied its source into yours. After writing, when `outExt` is not `".ts"`, the generator looks for that layout: `zapatos/schema.ts`, a `zapatos/src` folder, or a file under `zapatos/custom` that does not end in `.d.ts`. If it finds one, it warns, through [`warningListener`](/generator#generate.warningListener), with the steps to convert:

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

So moving from `outExt: ".ts"` back to `".d.ts"` warns too, until you delete the `.ts` files.

Why the types look as they do, a `timestamptz` a `Date` in `Selectable` and a string in `JSONSelectable`: [The catalog](/catalog-types).

## `SchemaVersionCanary` {#SchemaVersionCanary}

```ts
interface SchemaVersionCanary { version: 104 }
```

The version of the generated schema's format that this `zapatos/db` reads. The generated `zapatos/schema` declares `interface schemaVersionCanary extends db.SchemaVersionCanary { version: 104 }`, so a schema written for another format does not compile:

```txt
error TS2430: Interface 'schemaVersionCanary' incorrectly extends interface 'SchemaVersionCanary'.
  Types of property 'version' are incompatible.
```

- pgcast's version is Zapatos 6.6.1's, `104`, so the canary of a schema that Zapatos 6.6.1 generated passes.
- Regenerating the schema clears the error ([Generator](/generator)).

## Several databases {#several-databases}

Each `schema.d.ts` declares `zapatos/schema`, the one module `zapatos/db` takes its tables from, so a compilation types one database. For two, give each its own TypeScript project, and type by hand what one passes to another. Here, the docs' database, `films`, beside a small `box_office` database with its own `films` table, whose `id` is a `text`, and a `takings` table.

```txt
tsconfig.json
tsconfig.base.json
films/
├── pgcastconfig.json
├── tsconfig.json
└── src/
box_office/
├── pgcastconfig.json
├── tsconfig.json
└── src/
```

- `tsconfig.json` has no files: a reference to each project. `tsconfig.base.json` holds your usual options.
- Each `src/` holds its database's `zapatos/` folder and the queries on that database.

::: code-group

```json [tsconfig.json]
{ "files": [], "references": [{ "path": "films" }, { "path": "box_office" }] }
```

```json [films/tsconfig.json]
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

```json [films/pgcastconfig.json]
{ "db": { "connectionString": "{{FILMS_DATABASE_URL}}" }, "outDir": "./src" }
```

:::

```sh
(cd films && npx pgcast)
(cd box_office && npx pgcast)
npx tsc -b
```

- `box_office/` holds the same two files, its config naming <code v-pre>{{BOX_OFFICE_DATABASE_URL}}</code>.
- The CLI reads the config of the folder it runs in ([The CLI](/generator#cli)): run it, and [`--check`](/generator#check) in CI, in each project's folder. Or from the root, with the JSON argument: <code v-pre>npx pgcast '{"db": {"connectionString": "{{FILMS_DATABASE_URL}}"}, "outDir": "./films/src"}'</code>.
- Each project includes its own `src`, so its own `zapatos/` folder only. `tsc -b` builds them one at a time, on TypeScript 5.9 and on 4.1 under `skipLibCheck` ([On an older TypeScript](/install#on-an-older-typescript)). One package and one `node_modules` are enough.
- The pool is chosen at `.run()`, as always, and nothing ties a table to it. Run on the `films` pool, `box_office`'s `takings` query fails, `42P01 relation "takings" does not exist`; its `films` query runs, and returns the docs' rows, an `id` of `1000` typed as a `string`.

::: warning Across projects
A column read from another project's declarations can be `any`, `unknown` or another database's type, by reader and TypeScript version, and `skipLibCheck` hides why: type what crosses by hand.
:::

### Both in one compilation {#both-in-one-compilation}

A root `tsconfig.json` that includes `films/src` and `box_office/src` declares `zapatos/schema` twice.

- In the `.d.ts` files: TS6200, TS2717 and others. Under `skipLibCheck`, these go, silently.
- The file that comes first wins, and the queries on the other are refused: `box_office`'s `db.select('takings', …)`, TS2345 `Argument of type '"takings"' is not assignable to parameter of type 'Table'`; with the folders swapped, `films`'s `{ id }` and `'studios'`.

### Types across projects {#types-across-projects}

An app that wires both, or another package of a monorepo, reads `films`'s emitted declarations. Without a type of yours, they name its tables as TypeScript writes them: by string, `db.JSONOnlyColsForTable<"films", …>`, or by module, `import("zapatos/schema").takings.JSONSelectable`. Each is resolved in the **reader's** compilation:

| The reader | TypeScript 5.5 and later | Before 5.5 |
|---|---|---|
| An app with no schema of its own | `any`: `const title: number = page.title` compiles | the schema a declaration pulls in, else `any`: here `page.title` is `box_office`'s `films.title` |
| A project with its own schema | its own table of that name (`page.id` a `string` in `box_office`), `unknown` for a table it lacks, or `any` | as from 5.5, until a declaration pulls the other's schema in: then both, [in one compilation](#both-in-one-compilation), its own queries refused |

- A misspelt column is still refused, TS2551.
- Before 5.5, a declaration that names a table by module starts with `/// <reference path>` to its project's `schema.d.ts`, which joins the reader's compilation: here `box_office`'s `takings()` brings `box_office`'s, and 4.1, which names every table by module, brings `films`'s too. From 5.5 that line is gone, and a table named by module that the reader lacks is `any`.

Without `skipLibCheck`, the reader's `.d.ts` errors say so: TS2307 on `zapatos/schema` with no schema, TS2344 or TS6200 with one. The way out is a type written out as plain TypeScript, never `s.films.JSONSelectable`:

```ts twoslash [films/src/queries.ts]
import * as db from 'zapatos/db';
import type { Pool } from 'pg';

export interface FilmPage {
  id: number;
  title: string;
  release_year: number;
  studio: { name: string };
}

export const filmPage = (pool: Pool, id: number): Promise<FilmPage> =>
  db.selectExactlyOne('films', { id }, {
    columns: ['id', 'title', 'release_year'],
    lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) },
  }).run(pool);
```

- `films`'s own compilation checks the query against it: `title: number` there fails, TS2322.
- Its declarations name no table, so every reader reads `FilmPage` as written: `const title: number = page.title` fails, TS2322, from 4.1 to 5.9.
- Give each export that crosses its type: one left without brings back the table above.

### In the editor {#in-the-editor}

- With `references`, the editor (tsserver 5.9) loads a referenced project's sources rather than its `.d.ts`, without that project's schema: `page` is `JSONOnlyColsForTable<string, string[]>`, and `page.titel`, which `tsc -b` refuses, passes. It does not agree with `tsc -b`.
- With `"disableSourceOfProjectReferenceRedirect": true` in the reader's `compilerOptions`, after a `tsc -b`, it reads the `.d.ts`, and agrees.
- A type written by hand reads the same either way: `page` is `FilmPage`.

### Out of scope {#several-databases-out-of-scope}

- A query across databases, through `dblink` or a foreign table: one query, one database. A foreign table is generated with the tables of the database that declares it.
- A module per database: `zapatos/db` takes its types from `zapatos/schema` alone, and a copy of it per database was weighed and set aside ([decision 011](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/011-several-databases.md)).
