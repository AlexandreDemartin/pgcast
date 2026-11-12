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
- A cast panel's example is a module in `examples/`, its imports above `// ---cut---`, hidden on the page:

  ```md
  <CastPanel example="home">

  <<< ./examples/home.ts{ts twoslash}

  </CastPanel>
  ```

  At build, `.vitepress/cast.data.ts` runs it against a pool that only records the query `.run()` gets from `.compile()`: its SQL (laid out on lines, whitespace only) and values fill "Postgres runs". "TypeScript knows" is the type Twoslash gives the module's first `const`. Nothing in a panel is typed by hand.

## The docs schema

`schema.sql`, in George MacKerron's world. `zapatos/schema.d.ts` is generated from it by pgcast's own generator and committed, so a build needs no database. After a change to `schema.sql` or to the generator, regenerate it:

```sh
npm run build                  # at the root
cd website && npm run docs:schema
```

`docs:schema` loads `schema.sql` into a temporary `pgcast_test_docs_*` database on the server of `TEST_DATABASE_URL` (the environment, else `src/.env`), runs `generate()`, and drops the database.
