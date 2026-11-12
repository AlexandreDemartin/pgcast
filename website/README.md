# The docs site

pgcast's documentation ([decision 004](../docs/decisions/004-documentation-site.md)), on VitePress, with the look of [art-direction.md](../docs/design/art-direction.md). A package of its own: nothing here reaches the library.

## Build

The site installs the library as a user would (`"zapatos": "file:.."`), so build the library first. Node 22.18 or later: the cast panels run their examples with Node's type stripping.

```sh
npm ci && npm run build        # at the root
cd website && npm ci
npm run docs:build             # or docs:dev, docs:preview
```

## Examples

- A `ts twoslash` block is compiled against the built `zapatos/db` and the docs schema's `zapatos/schema`; hovers show the types TypeScript gives. An unexpected type error fails the build; a block meant to fail says so with `// @errors: <code>`.
- Twoslash reports only a block's own errors, so `docs:build` first runs `tsc` (`tsconfig.json`) on the docs schema and `examples/`: a stale schema fails there.
- A cast panel's example is a module in `examples/`, its imports above `// ---cut---`, hidden on the page:

  ```md
  <CastPanel example="home">

  <<< ./examples/home.ts{ts twoslash}

  </CastPanel>
  ```

  At build, `.vitepress/cast.data.ts` runs it against a pool that only records the query `.run()` gets from `.compile()`: its SQL (laid out on lines, whitespace only) and values fill "Postgres runs". "TypeScript knows" is the type Twoslash gives the module's first `const`: its name, then one level down. Nothing in a panel is typed by hand; the loader checks itself before each build (a type error must fail, the layout must change whitespace only, a query whose result transform throws on no rows is still recorded).

## The docs schema

`schema.sql`, in George MacKerron's world: the tables of his guide, as his docs create them, and the rows he seeded: `authors`, `books` and their `tags`, keys from 1000. The other tables start empty, so an example that inserts gets 1, 2, 3, as in his docs. Plain Postgres, 14 or later: `stores` has a `point` where his had a PostGIS geometry.

`zapatos/` is generated from it by pgcast's own generator and committed, so a build needs no database: `schema.d.ts`, and in `custom/` the placeholder for `point` (`PgPoint`, `any` until edited; the generator never overwrites it). CI regenerates it and fails if anything differs. After a change to `schema.sql` or to the generator, regenerate it:

```sh
npm run build                  # at the root
cd website && npm run docs:schema
```

`docs:schema` loads `schema.sql` into a temporary `pgcast_test_<pid>_docs` database on the server of `TEST_DATABASE_URL` (the environment, else `src/.env`), runs `generate()`, and drops the database.
