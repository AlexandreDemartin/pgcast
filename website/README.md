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

## The reference

Every export of `zapatos/db` (a member of `conditions` as `conditions.eq`), every option of its `Config` (`Config.transactionAttemptsMax`) and of the generator's (`generate.outDir`) has an entry: a heading of a Reference page that ends in its name as an anchor, `` ## `insert()` {#insert} ``. Until its page is written, a name waits in `reference-pending.json`, under that page. `docs:build` runs `check-reference.mjs` after `tsc`: it reads the names from the built library's declarations, and fails on a name with neither, on a pending name that already has its entry, and on a pending name the library no longer has; each line says which page to add it to. So the list only shrinks: a reference page's PR removes its names.

## The docs schema

`schema.sql`, pgcast's own example world: a film's cast (studios, films, actors and their roles, crew, cinemas, screenings, seat bookings, ratings, tags), every name invented, seeded rows from id 1000. The seeded screenings have fixed dates, in March 2030: an example filters on an explicit date, never on `now()`, so its result stays the same. `zapatos/` is generated from it by pgcast's own generator and committed, so a build needs no database; CI regenerates it and fails if anything differs. After a change to `schema.sql` or to the generator, regenerate it:

```sh
npm run build                  # at the root
cd website && npm run docs:schema
```

`docs:schema` loads `schema.sql` into a temporary `pgcast_test_<pid>_docs` database on the server of `TEST_DATABASE_URL` (the environment, else `src/.env`), runs `generate()`, and drops the database.
