# 004 — The documentation site

- **Status**: accepted (2026-11-12).
- **Scope**: step 1 of Epic [#85](https://github.com/AlexandreDemartin/pgcast/issues/85), issue [#89](https://github.com/AlexandreDemartin/pgcast/issues/89). Nothing is implemented here.

## Context

- George MacKerron's docs (`docs/index.html`) are one long page. Each example shows the TypeScript, the SQL it produced and the result, with the inferred types on hover in Monaco. His build ran every example against a temporary database to capture the SQL and the result; the types were computed in the browser from bundled `.d.ts` files ([zapatos-docs](https://github.com/jawj/zapatos-docs), `bin/compile-docs.js`).
- They no longer describe pgcast: its security fixes, its opt-ins and their warnings, and the features to come.
- The owner wants the same spirit, done better: a polished site on par with the best package docs, dark and light mode, and the approved art direction ([art-direction.md](../design/art-direction.md), [prototype](../design/prototype.html)).

## Criteria

1. **George's three-way view** (TypeScript / SQL / inferred type), the types computed at build by Twoslash from a schema that pgcast's own codegen generates, so an example cannot drift from the library.
2. **The art direction**: our own CSS tokens and a custom component for the cast panel.
3. Dark and light mode; search; deploy to GitHub Pages from CI.
4. Docs versioned per release.
5. **Nothing added to the library**: no runtime dependency and no new dev dependency in the root `package.json`. The site is a separate `website/` package with its own `package.json` and lock file.
6. Maintenance cost; use by comparable libraries.

## Options

Versions and dates from the npm registry on 2026-11-12; other facts from the sources at the end.

| | A. VitePress + Twoslash | B. Starlight + Expressive Code Twoslash | C. Docusaurus | D. Fumadocs | E. Hand-written static HTML |
|---|---|---|---|---|---|
| **Version** | 1.6.4 stable; 2.0.0-alpha.21 (2026-10-25), alpha since 2025-01. `@shikijs/vitepress-twoslash` 4.6.0 (2026-11-02) | Starlight 0.42.10 (2026-11-06), still 0.x, on Astro 7. `expressive-code-twoslash` 0.6.1 (2026-03-14) | 3.10.2, announced as the last 3.x; 4.0 in canary | 16.19.0 (2026-11-11); `fumadocs-twoslash` 4.0.4 | — |
| **Three-way view, types at build** | Twoslash by the Shiki team, on the real TypeScript language service; `compilerOptions` and `extraFiles` configurable; a Vue component for the cast panel | Community plugin (StudioCMS), on a fork of Twoslash; needs Expressive Code 0.41 while Starlight 0.42 ships 0.44 (issue #123, open since 2026-06) | No maintained Twoslash: `docusaurus-preset-shiki-twoslash` is on Shiki 0.x; the way out is `@shikijs/rehype` and swizzled components | Twoslash on the TypeScript 7 native compiler, in beta; custom `compilerOptions` undocumented | Ours to build: George's pipeline, or `twoslash` and Shiki called from a script |
| **Unexpected type error fails the build** | Yes, in build (not in dev); `// @errors` for intended ones | Not documented | With `@shikijs/rehype`, yes (`throws`) | Not documented | Up to the script |
| **Custom theme** | CSS variables, theme extension, Vue components | CSS variables, component overrides | CSS, swizzling (React) | Tailwind 4 | Total: the prototype is this |
| **Dark / light** | built in | built in | built in | built in | the prototype's |
| **Search** | local (MiniSearch), offline | Pagefind, offline | Algolia; local search is community-only | Orama, in the browser | ours |
| **GitHub Pages** | official guide | official Astro guide | official guide | static export; no Pages guide | trivial |
| **Versions** | none built in | community plugin, 0.x | **built in** | version roots in `meta.json` | ours |
| **Footprint and churn** | 18 direct deps (Vue, Vite) | ~80 direct deps (Starlight and Astro); two Astro majors in 2026 | 42 direct deps (React, webpack or Rspack); MDX-only 4.0 ahead | ~60 direct deps, plus Next 16 and Tailwind 4; a major every 3 to 9 months | none, but search, routing, dev server and versions are ours to keep |
| **Used by** | Vite, Vitest (2.0 alpha), Hono (1.6) | Biome, Astro | Kysely, pgTyped | Zod, Prisma | Zapatos |

Others seen: tRPC left Docusaurus for TanStack Start with `@shikijs/twoslash`; TanStack, Effect, Valibot and Drizzle run their own sites; Slonik has no site. None of the comparables uses `expressive-code-twoslash`.

## Proposed choice

**A. VitePress with `@shikijs/vitepress-twoslash`**, in `website/`.

- The only option where types at build are first-party, configurable and fail the build, and the one the closest comparables chose (Vite and Vitest, by VitePress's own authors).
- The smallest footprint of the frameworks; our theme on its CSS variables; the cast panel as one Vue component.
- Pinned exactly, on the 2.0 line as Vite and Vitest run it. The plugin 4.x needs Shiki 4, which only VitePress 2.0 ships; falling back to 1.6.4 means the plugin's 2.5.0 (Shiki 2), as Hono does.
- What it lacks, versions, is a CI loop (below), not a framework feature.
- E stays the fallback if VitePress 2.0 stalls: the prototype is already its theme.

### The site

- **Its look**: [art-direction.md](../design/art-direction.md) is the design input of the skeleton step, whatever tool is chosen; the tool must take its CSS tokens and a custom component for the cast panel.
- **Its pages**: taken from George's sections, rewritten in pgcast's voice with George's world for examples; the nav of the prototype.

| Group | Pages | From George's docs |
|---|---|---|
| Home | the hero, the cast panel, four pillars | What does it do?, How does that look? |
| Getting started | Install · Configure · Generate your schema · Import it | How do I get it? (environment variables, ESLint, programmatic generation, custom types and domains) |
| Guide | The `sql` template · `select()` · `insert()` and `upsert()` · Conditions · Lateral joins · Transactions · Errors | `sql` tagged templates and their interpolations, `SQLFragment`, manual joins, shortcuts and lateral joins, `transaction`, Errors |
| pgcast | Switching from Zapatos · Opt-ins · Security notes · Versions | — (CHANGELOG, decision 003, the characterisation report) |
| Reference | Run-time configuration · Utility types | Run-time configuration, Utility types |

- George's "About" (changes, contributions, alternatives) is replaced by the changelog, `CONTRIBUTING.md` and the README.
- Each page ends with "Edit this page" and "Checked against the docs schema at build · pgcast 6.7.0" (the version documented).

### How examples are checked in CI

- **One docs schema** in George's world (`website/schema.sql`: `authors`, `books`, `tags`, `employees`, …). CI loads it into Postgres and runs pgcast's codegen on it; the generated `schema.d.ts` is committed, and CI fails if it differs, so a local build needs no database.
- **Types**: `website/` installs the library as a user would, `"zapatos": "file:.."`, after the root `npm run build`. Twoslash compiles every block against the built `zapatos/db` and the generated `zapatos/schema`; an unexpected error fails the build; a block meant to fail says so with `// @errors`.
- **SQL**: never typed by hand. A build-time data loader calls `.compile()` on each example and fills the cast panel's SQL and values.
- **Run**: a CI job runs every example against the docs schema, so a query that type-checks but fails in Postgres fails CI.
- **Links**: VitePress fails the build on a dead internal link.
- **When**: the `docs` job runs on any change to `website/` **or** `src/`, since a runtime change can break an example; deploy on a push to `master`.

### Versions

- The site's root documents the latest release; `/next/` documents `master`.
- Each page marks what came in a minor ("6.7", as the prototype's Opt-ins badge): 6.x minors are drop-ins, so one 6.x site serves them all.
- At each major, the last docs of the previous one stay under `/6.x/`.
- A list in `website/versions.json` maps each path to a git ref; the deploy job builds each and publishes one Pages artifact. No `gh-pages` branch.
- Until a release contains `website/`, the root is built from `master`.

### Docs follow the code

- New rule: **each feature PR updates its docs page**, checked by the same build. A "Document …" PR remains only for a guide that spans a series.
- Written in skill `pr-shape` § Splitting like Zapatos, the row "Docs follow the code", which says today that the usage guide comes in a "Document …" PR after the series; and in the issue template's **Files**.

### Planned PRs, in the order of Epic #85

| Step | PR |
|---|---|
| 2. Skeleton | "Add a documentation site in website/" (VitePress, the theme of [art-direction.md](../design/art-direction.md), nav, home, dark / light, search, footer, one Install page) · "Deploy the docs to GitHub Pages from CI" · "Add the cast panel, with types computed by Twoslash" |
| 3. Docs schema | "Add the docs schema in George's world, generated by pgcast" · "Compile and run every docs example in CI" |
| 4. The guide | one PR per page or close pair: Getting started · the `sql` template · `select()` · `insert()` and `upsert()` · Conditions · Lateral joins · Transactions and Errors · Reference |
| 5. pgcast's own | "Document switching from Zapatos and the versions policy" · "Document each opt-in and its warning" · "Add the security notes" |
| 6. Docs follow the code | "Make each feature PR update its docs page" (skill `pr-shape`, issue template) · "Version the docs per release" · "Point the README and the repository at the docs site" |

## Risks

- **VitePress 2.0 is alpha**; pinned exactly, with Dependabot on `website/` as its own entry.
- **TypeScript 7** is now `latest` on npm, and Twoslash supports 5.5 to 6 only; `website/` pins the root's TypeScript (5.9.3).
- **The ambient `zapatos/schema`**: Twoslash reads no `tsconfig.json`; the generated file goes in through `compilerOptions` or `extraFiles`, to prove in the cast panel PR. If it fails: George's way, the TypeScript API at build (as #93 checks the README's example).

## Decision

The owner's answers, 2026-11-12:

1. **VitePress with Twoslash**, in a separate `website/` package. Its dev dependencies (`vitepress`, `@shikijs/vitepress-twoslash`, `vue`, `typescript`, `pg`) are approved there only; none goes in the library.
2. **VitePress 2.0 alpha**, pinned exactly.
3. **GitHub Pages** at `alexandredemartin.github.io/pgcast/`. The owner turns Pages on, source "GitHub Actions", at the skeleton step.
4. **Versions** as written: the latest release at the root, `/next/` for `master`, one frozen copy per major, as Docusaurus and Vite do (the industry standard).
5. **"Each feature PR updates its docs page"** as written, docs as code, as Write the Docs and Django require.
6. George's `docs/index.html` and its bundle are **removed** once pgcast's site is live; the site links [jawj.github.io/zapatos](https://jawj.github.io/zapatos/) as the Zapatos 6.6.1 docs.

## Sources

- VitePress: [Twoslash plugin](https://shiki.style/packages/vitepress), [its source](https://github.com/shikijs/shiki/blob/main/packages/vitepress-twoslash/src/index.ts), [search](https://vitepress.dev/reference/default-theme-search), [deploy](https://vitepress.dev/guide/deploy), [build-time data loading](https://vitepress.dev/guide/data-loading).
- Twoslash: [notations](https://twoslash.netlify.app/refs/notations), [options](https://github.com/twoslashes/twoslash/blob/main/packages/twoslash/src/types/options.ts).
- Starlight: [Expressive Code Twoslash](https://twoslash.studiocms.dev/getting-started/installation/), [its issues](https://github.com/withstudiocms/expressive-code-twoslash/issues), [search](https://starlight.astro.build/guides/site-search/), [versions plugin](https://starlight-versions.vercel.app/getting-started), [Astro on GitHub Pages](https://docs.astro.build/en/guides/deploy/github/).
- Docusaurus: [versioning](https://docusaurus.io/docs/versioning), [search](https://docusaurus.io/docs/search), [deployment](https://docusaurus.io/docs/deployment), [`docusaurus-preset-shiki-twoslash`](https://www.npmjs.com/package/docusaurus-preset-shiki-twoslash).
- Fumadocs: [Twoslash](https://www.fumadocs.dev/docs/markdown/twoslash), [static export](https://fumadocs.dev/docs/deploying/static), [versioning](https://www.fumadocs.dev/docs/versioning).
- Comparables: the docs `package.json` of [Vite](https://github.com/vitejs/vite/tree/main/docs), [Vitest](https://github.com/vitest-dev/vitest/tree/main/docs), [Hono](https://github.com/honojs/website), [Kysely](https://github.com/kysely-org/kysely/tree/master/site), [pgTyped](https://github.com/adelsz/pgtyped), [tRPC](https://github.com/trpc/trpc/tree/main/www), [Zod](https://github.com/colinhacks/zod/tree/main/packages/docs), [Prisma](https://github.com/prisma/docs), [Biome](https://github.com/biomejs/website), [Astro](https://github.com/withastro/docs).
- George's docs build: [zapatos-docs](https://github.com/jawj/zapatos-docs).
