# 005 — A playground in the browser

- **Status**: accepted (2026-11-13), the owner's answers in § Decision.
- **Scope**: issue [#296](https://github.com/AlexandreDemartin/pgcast/issues/296) of feature [#291](https://github.com/AlexandreDemartin/pgcast/issues/291). Nothing is implemented here.

## Context

- The aim: a page, `/playground`, where a reader edits pgcast code against the docs schema and sees the type of the result, the compiled SQL (`text` and `values`) and the rows Postgres returns.
- Zapatos's docs had "Explore types »": Monaco in an overlay, every `.d.ts` added with `addExtraLib` (`docs/docs.js`, `docs/zapatos-bundle.js`). The SQL and the results were captured at build; nothing ran in the page.
- pgcast's site already computes the type and the SQL of each example at build (Twoslash, and the recording pool of `website/.vitepress/cast.data.ts`), and runs each example on Postgres in CI (`run-examples.mjs`).
- Feature #58 plans a PGlite adapter in its own package (PR 4), after a structural `Queryable` (PR 1). The playground cannot wait for it, and must not pre-empt it.

## Criteria

1. **Nothing in the library**: no change to `src/`, `dependencies` or `exports`. Everything lives in `website/`, with its dev dependencies approved there only (decision 004, § Decision 1).
2. **Only `/playground` pays**: the other pages load the same bytes as today.
3. **The same types as the docs**: the TypeScript of the build (5.9.3) and the generated `website/zapatos/schema.d.ts`.
4. **The SQL is pgcast's own**: the real runtime compiles it, never a copy.
5. **Nothing leaves the browser**; a shared link never runs on its own.
6. Maintenance: few packages, pinned exactly; simple big wins over clever glue (skill `simple-big-wins`).

## What was measured

On 2026-11-13: npm registry versions, tarball sizes (gzip `-9`), an Apple M3 Pro, Node 22.23, headless Chrome 157. The probes stay out of the repository.

| Piece | Raw | Gzip |
|---|---|---|
| Monaco 0.57.0 (MIT), TypeScript language only, built by Vite 8.3.4 (VitePress 2.0.0-alpha.21's): editor, editor worker, CSS, font, TS worker | 11.5 MB | **2.68 MB** |
| of which the TS worker (TypeScript 5.9.3, as the root's) | 6.9 MB | 1.48 MB |
| PGlite 0.5.16 (Apache-2.0 or PostgreSQL License): `pglite.wasm` 3.24, `pglite.data` 1.85, `initdb.wasm` 0.13 MB | 15.6 MB | **5.2 MB** |
| pgcast's runtime, bundled for a page (esbuild, minified, with `json-custom-numbers`) | 52 KB | 20 KB |
| Types: `dist/db/*.d.ts` 74 KB, `website/zapatos/**/*.d.ts` 53 KB, `@types/pg` 15 KB | 142 KB | ~25 KB |
| `docs/monaco/` (Zapatos's docs): two AMD copies, 0.33.0 (TS 4.5) and 0.44.0 (TS 5.0.2), every language | 24.0 MB | 5.66 MB |
| CodeMirror 6 + `@valtown/codemirror-ts` 2.3.1 + `@typescript/vfs` 1.6.6 + TS 5.9.3, built by Vite | 7.5 MB | 2.13 MB |
| Transpilers alone: esbuild-wasm 0.28.2 · TypeScript 5.9.3 `typescript.js` · sucrase 3.35.1 | 14.0 · 9.1 · 0.5 MB | 3.75 · 1.64 · 0.12 MB |

- **Build time**: Vite builds Monaco with the TS worker in 1.3 s.
- **PGlite 0.5.16 embeds PostgreSQL 18.6** (`SELECT version()`), the newest of the CI matrix (14, 16, 18); the docs job runs on 14. 0.5.0 (2026-06-02) moved to Postgres 18; 16 patch releases since. Its home page's "under 3MB Gzipped" predates this: the wasm alone is 3.24 MB.
- **Start-up**: `PGlite.create()` takes 0.77 s in Chrome (twice; localhost, no download) and 1.0 to 1.3 s in Node; `schema.sql` loads in 20 ms; a first `select` with a `lateral` takes 2 ms. The 5.2 MB take 0.8 s at 50 Mbit/s, 4.2 s at 10 Mbit/s.
  - A dumped data directory (`loadDataDir`) starts in 0.19 s but weighs 4.6 MB more: not worth it.
  - No `COOP`/`COEP` headers needed: the probe ran on a plain static server.
- **GitHub Pages** serves `pgcast.dev` with gzip (no brotli), `access-control-allow-origin: *` and `max-age=600`; it gzips `application/wasm` (checked on a `github.io` site). Whether it gzips `pglite.data` (`application/octet-stream`) is unknown: 6.2 MB if not.
- **Extensions**: the docs schema needs none (`POINT`, a GiST index and a domain are core). PGlite 0.5 ships 40 contrib modules as separate files; others are packages of their own.
- **Monaco**: "Is the editor supported in mobile browsers? No." (its README).

### pgcast's runtime against PGlite

Run in Chrome and in Node on the docs schema, with no change to `src/`:

- **`pg` cannot be bundled for a page**: esbuild fails on `net`, `tls`, `dns`, `events`, `util/types` (19 errors). `transaction.ts` imports it for `instanceof pg.Pool` and `pg.Client`. Aliased to a 3-line stub (two empty classes), those checks fail and `typeofQueryable` falls back to `_connected`: an object without it is a pool, used through `connect()` and `release()`.
- **`zapatos/db` reads two Node globals**: `Buffer` at load (`builtinPrototypes`, `core.ts`), so the import throws `ReferenceError: Buffer is not defined`; `process.emitWarning` on a deprecation warning (`warnOnce`, `utils.ts`). Two lines set them in the page (`class Buffer extends Uint8Array {}`, `{ emitWarning }`). Guarding them in `src/` would touch `core.ts`, a stop point, for no user of the library.
- **The adapter is ten lines**: `run()` sends `query({ text, values, name? })` and reads `rows`; `transaction()` reads `command` of its `COMMIT`. PGlite's `query(text, params)` returns `rows`, `rowCount` and `command` (0.5.5). It ran: a `select` with a `lateral`, an `insert`, a `count`, a `serializable()`, a 42703 with its `code` (`isDatabaseError` true), and a `COMMIT` answered `ROLLBACK` (PGCAST_DEP003 warned).
- **One connection**: PGlite "only has a single exclusive connection". The probe's `connect()` returned the same object; PR 2's must act as a pool of one, waiting for the previous `release()`. Two transactions at once run one after the other, so a real serialisation failure cannot be shown.
- **Parsing**, PGlite's default against `pg`'s: `numeric`, `date`, `timestamptz` and `json` match; `int8` is a `bigint` (pg: a string), `bytea` a `Uint8Array` (pg: a `Buffer`), `point` the string `(1,2)` (pg: `{ x, y }`). PGlite's `parsers` option fixes each (`int8` proved). Shortcuts return JSON (`to_jsonb`), so this touches only raw `sql` selects.
- **PGlite's `node-postgres` export** (`createPgConfig`, 0.5.13) runs a real `pg.Pool` on PGlite, so it parses like `pg` for free, but it needs `pg` and Node's built-ins in the page (`events`, `process.nextTick`, `net`…): shaky there, a good fit for #58's tests in Node.
- **Types**: `Queryable` is `pg.ClientBase | pg.Pool`. The reader's code declares `pool: pg.Pool`, as every docs example does; the adapter is cast once, inside `website/`. Once #58 makes `Queryable` structural, the cast goes; once its PGlite package ships, the playground uses it.

### `docs/monaco/`

- Not reusable: an AMD build of Monaco 0.44.0 with TypeScript 5.0.2 (`docs/docs.js` loads `./monaco/vs`), plus an older 0.33.0 copy at its root, every language, 214 files.
- What carries over is the method: `addExtraLib` for each `.d.ts` at a `file:///node_modules/…` path, strict compiler options. Today's bundle is built from `website/node_modules/zapatos` and `website/zapatos/` at docs build, never committed.
- It leaves with `docs/index.html` (decision 004, § Decision 6), in its own PR.

## Options

| | A. Types and SQL, no Postgres | B. A, then Postgres on the first Run (PGlite) | C. B with CodeMirror 6 | D. Link out to the TypeScript Playground |
|---|---|---|---|---|
| **The reader sees** | hover types, errors, completion; the `text` and `values` of each query | A, and the rows; errors with their SQLSTATE; transactions | B, with a lighter hover UI | types only: no SQL, no rows |
| **How it runs** | the code, transpiled by the TS worker (`getEmitOutput`), in a module worker with a recording pool, as `cast.data.ts` at build | the same worker, then PGlite in it, the docs schema loaded | the same, TS in a worker through `@typescript/vfs` | nothing of ours |
| **Weight on `/playground`** | 2.7 MB gzip | 2.7 MB, then 5.2 MB on the first Run | 2.1 MB, then 5.2 MB | none |
| **Weight on other pages** | none (a client-only component, imported on demand) | none | none | a link |
| **`website/` dev deps** | `monaco-editor` | + `@electric-sql/pglite` | `codemirror`, `@codemirror/lang-javascript`, `@valtown/codemirror-ts`, `@typescript/vfs`, + PGlite | none |
| **Phone** | Monaco: unsupported | unsupported | supported | the TS Playground's |
| **Maintenance** | Monaco reorganised its ESM entry points in 0.56 | + PGlite 0.x, 16 patches since June | four packages, hover and theme glue of our own | ATA would fetch Zapatos 6.6.1's `zapatos` from npm, not pgcast; the 140 KB of `.d.ts` do not fit a URL |
| **Used by** | Kysely's playground (Monaco, TS 5.0.2 `transpile`, a driver that records the SQL) | PGlite's REPL on pglite.dev (SQL only) | Val Town, its author | — |

Set aside:

| Idea | Why not |
|---|---|
| StackBlitz WebContainers | an outside service, a commercial licence for the API, a Node in the page for one query |
| A server that runs the queries | GitHub Pages is static; cost and attack surface for a docs page |
| esbuild-wasm or sucrase to strip types | the TS worker already emits JS, with the same compiler: 0 bytes more |
| `lz-string` for the URL | `CompressionStream('deflate-raw')` and base64url do it natively (Baseline 2023), with no dependency |
| An editable schema | the generator reads the catalog through `pg` and writes files: its own note, if readers ask for it |

## Proposed choice

**B, reached through A**, with Monaco:

- The only option that meets the aim (types, SQL and rows), with the compiler of the build (TS 5.9.3) and pgcast's real runtime.
- PR 1 is A: useful alone, as Kysely's playground is, and 2.7 MB on one page.
- PGlite comes in PR 2, loaded on the first Run only: a reader who reads types and SQL never downloads Postgres.
- Monaco over CodeMirror: hovers as in VS Code (Zapatos's "embedded VS Code"), one package against four, 0.6 MB more; phones get the code read-only.

### The playground

- **What the reader edits**: the code only. The docs schema is fixed, shown read-only beside it (`schema.sql`).
- **The code** reads like a docs example (`import * as db from 'zapatos/db'`, `declare const pool: pg.Pool`), starting from the tutorial's first query.
- **Run**: on a click, never on load. Transpiled by the TS worker, imported from a Blob URL in a module worker (with `zapatos/db` and `pg` mapped to the page's modules), stopped after 10 s (`worker.terminate()`), as `run-examples.mjs` limits each example.
- **The worker is the sandbox**: no DOM, no access to the page, and the page stays responsive while PGlite starts. The site has no cookies or accounts to steal.
- **Never sent anywhere**: no backend, no analytics; the database lives in memory and is gone on reload; a shared state lives in the URL fragment, which browsers do not send to the server.
- **Sharing**: `#code/` + the code deflated and base64url-encoded, as the TypeScript Playground's `#code/` (lz-string there).
- **Look**: a Monaco theme from the art direction's tokens and `syntax.ts`'s colours, light and dark ([art-direction.md](../design/art-direction.md)).

### Planned PRs, as sub-issues of #291

| # | PR | Risk |
|---|---|---|
| 1 | "Add a playground page that shows the type and the SQL of a query": `website/playground.md`, a client-only component, Monaco (TypeScript only), the `.d.ts` bundled at build, the recording pool in a worker; a proof that the other pages' requests are unchanged | normal |
| 2 | "Run the playground's queries on Postgres in the page, with PGlite": PGlite on the first Run, `schema.sql`, the adapter (a pool of one, `pg`'s parsers), the `pg` stub and the two globals, a time limit; a Node check in `docs:examples` that the adapter parses the docs schema's types like `pg`; Pages' compression of `pglite.data` measured | normal |
| 3 | "Share a playground in its URL" | low |
| 4 | "Open each docs example in the playground": a link on the cast panel | low |

Later: the playground on #58's PGlite package, once it ships.

## Risks

- **PGlite is 0.x**, 16 patches in five months: pinned exactly, Dependabot on `website/`.
- **Monaco on phones**: read-only there, said so.
- **Arbitrary code on `pgcast.dev`**: a shared link is code someone else wrote. It runs only on a click, in a worker, and the reader sees it first.
- **Site size**: ~27 MB more per copy of the docs (the root and `/next/`, decision 004), ~54 MB of the 1 GB Pages limit.
- **GitHub Pages' 10-minute cache**: after it, the 5.2 MB is revalidated by its `etag`, not downloaded again.

## Decision

The owner, 2026-11-13, on the four questions of the proposal:

1. **B, reached through A, with Monaco.** Phones get the code read-only, with its compiled SQL, and a line saying the playground runs on a computer; not C.
2. **Two dev dependencies of `website/`**, pinned exactly: `monaco-editor` 0.57.0 (PR 1), `@electric-sql/pglite` 0.5.16 (PR 2). None in the library.
3. **The link**: Playground takes Changelog's place in the top bar (no fourth link), and the changelog moves to the footer, now that it is on the site (#293); "Open in playground" on each cast panel (PR 4). The hero keeps its two actions.
4. **The schema read-only** in the first version; an editable schema gets its own note if readers ask for it.

## Sources

- PGlite: [docs](https://pglite.dev/docs/) (single connection, licence), [bundler support](https://pglite.dev/docs/bundler-support) (Vite's `optimizeDeps.exclude`), [home](https://pglite.dev/) ("under 3MB Gzipped"), [CHANGELOG](https://github.com/electric-sql/pglite/blob/main/packages/pglite/CHANGELOG.md) (0.5.0 Postgres 18, 0.5.5 `command`, 0.5.13 `createPgConfig`), the npm tarball of 0.5.16.
- Monaco: the npm tarball of 0.57.0 (`README.md` § mobile, `CHANGELOG.md` 0.56.0 entry points, TS 5.9.3), [repository](https://github.com/microsoft/monaco-editor).
- Kysely's playground: [repository](https://github.com/kysely-org/kysely-playground) (`package.json`, `src/lib/executer/executer.ts`, `src/lib/state/state-manager.ts`, `src/lib/utility/typescript-utils.ts`).
- TypeScript Playground: [URL structure](https://www.typescriptlang.org/_playground-handbook/url-structure.html) (`#code/`, lz-string).
- CodeMirror: [`@valtown/codemirror-ts`](https://github.com/val-town/codemirror-ts), [`@typescript/vfs`](https://www.npmjs.com/package/@typescript/vfs).
- [`CompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream) (MDN); GitHub Pages [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) (1 GB).
- Zapatos's docs: `docs/docs.js`, `docs/zapatos-bundle.js`, `docs/monaco/`.

> Zapatos's old documentation (`docs/index.html`, `docs/docs.js`, `docs/zapatos-bundle.js`, `docs/monaco/` and their assets) was removed on 2026-11-14 (#314), as § Decision 6 of decision 004 planned; it is online at <https://jawj.github.io/zapatos/> and in the history (`git show v6.6.1:docs/index.html`).
