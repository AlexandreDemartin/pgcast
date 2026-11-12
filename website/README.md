# The docs site

pgcast's documentation ([decision 004](../docs/decisions/004-documentation-site.md)), on VitePress, with the look of [art-direction.md](../docs/design/art-direction.md). A package of its own: nothing here reaches the library.

## Build

The site installs the library as a user would (`"zapatos": "file:.."`), so build the library first. Node 22.18 or later: the cast panels run their examples with Node's type stripping.

```sh
npm ci && npm run build        # at the root
cd website && npm ci
npm run docs:build             # or docs:dev, docs:preview
```

## Writing a page

### Its group

The site is in the four groups of [Diátaxis](https://diataxis.fr/) (decision 004 § The site); `.vitepress/outline.ts` lists their pages. A page does one job, found by one question:

| Group | The question | It holds | It never holds |
|---|---|---|---|
| Tutorial | Is the reader learning? | one path, each step shown and checked | choices, every option, the why |
| How-to guide | Do they have a task in mind? | the steps of that task, in their order | a lesson from scratch, every option |
| Reference | Are they looking something up? | every export and option: its signature, the SQL it writes, its effect on the type | steps, opinions, the why |
| Explanation | Do they want the why? | prose: the idea, its history, its trade-offs | steps to follow, lists of options |

- What belongs to another job goes to its page, as a link.
- A new page: its entry in `outline.ts`, then `<link>.md`. Until the file exists, `[page].paths.ts` makes the entry a "Coming" page.
- A page that documents a minor carries its version in its entry, glued to the text: `'Versions, opt-ins and warnings<small class="since">6.7</small>'`.

### Templates

One per group, in `templates/`, not published (`srcExclude` in `.vitepress/config.ts`): copy one to `<link>.md`, then replace its text.

- [tutorial.md](templates/tutorial.md): steps the reader follows, each with what they see.
- [how-to.md](templates/how-to.md): the task, its steps, a link to the entry of each option.
- [reference.md](templates/reference.md): one entry per export, its signature, its cast panel, its options table.
- [explanation.md](templates/explanation.md): prose sections, then the entries they discuss.

### Conventions

- **Title and lede**: one `# ` title, the text of its outline entry; then one paragraph followed by `{.lede}` on its own line: what the page is for. `llms.txt` takes both (§ For assistants).
- **Headings**: `##` for sections ("On this page" lists them), `###` under them, in sentence case.
- **Notes**: a chip, then the text, with no side rail (art direction § Signature components). The text after the container's name is the chip, a word or two; a note is for what the reader must not miss.

  | Container | Chip | For |
  |---|---|---|
  | `::: tip Opt-in` | teal | an opt-in, or a tip worth a box (`::: tip Why the alias`) |
  | `::: info Coming` | grey | what isn't there yet (`::: info Not on npm yet`) |
  | `::: warning Security` | amber, the note too | a risk to the reader's data or queries |

- **Code**: a command in `sh`, a file in a `::: code-group` with its path as the label (`` ```ts twoslash [src/films.ts] ``), TypeScript as `ts twoslash` (§ Examples), except a signature, which does not compile on its own: plain `ts`.
- **Options tables**: the columns read Option → SQL it adds → Effect on the type, the option and its SQL in code, "none" when the type does not change. The SQL is what the built library compiles (`.compile().text`), never written from memory.
- **Links**: root-relative, without `.md`: `[Install](/install)`, an entry as `` [`select()`](/select#select) ``. A link to a page that does not exist fails the build.
  - The hash is the anchor exactly as written: an entry's name, case and dots kept (`` [`Config.castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) ``, `` [`SelectResultMode`](#SelectResultMode) `` on its own page); a heading without `{#…}` by its slug, in lower case with hyphens (`## Insert options` → `#insert-options`). No raw `<a href>`.
  - A raw `<a href>` to a page that does not exist fails it too, as does a link to an anchor that its page does not define or a root link outside the site's base, with the page and the link (`.vitepress/anchors.ts`). A name still in `reference-pending.json` counts as an anchor of its page, so a page can link an entry of a "Coming" page.
  - A tutorial ends on the three other groups.
  - A how-to links each option it uses to its entry.
  - A reference entry links its explanation for the why.
  - An explanation links the entries it discusses.
- **Voice**: warm and brief, first person where natural, British spelling (`colour`, `behaviour`, `licence`), Zapatos rather than its author (skill [`code-style`](../.agents/skills/code-style/SKILL.md) § Docs voice).
- **The film world**: every example on the docs schema (§ The docs schema), every name invented, an explicit date rather than `now()`.

### Examples

- A `ts twoslash` block is compiled against the built `zapatos/db` and the docs schema's `zapatos/schema`; hovers show the types TypeScript gives. An unexpected type error fails the build; a block meant to fail says so with `// @errors: <code>`.
- Twoslash reports only a block's own errors, so `docs:build` first runs `tsc` (`tsconfig.json`) on the docs schema and `examples/`: a stale schema fails there.
- **The cast panel** shows what you write, what Postgres runs and what TypeScript knows. It is for a query whose SQL and type the reader should see: a shortcut, an option that changes the SQL. Code that sends no query (a pool, a config, a type) is a plain `ts twoslash` block.
- A cast panel's example is a module in `examples/`, its imports above `// ---cut---`, hidden on the page (`examples/first-query.ts` is the shortest):

  ```md
  <CastPanel example="home">

  <<< ./examples/home.ts{ts twoslash}

  </CastPanel>
  ```

  At build, `.vitepress/cast.data.ts` runs it against a pool that only records the query `.run()` gets from `.compile()`: its SQL (laid out on lines, whitespace only) and values fill "Postgres runs". "TypeScript knows" is the type Twoslash gives the module's first `const`: its name, then one level down. Nothing in a panel is typed by hand; the loader checks itself before each build (a type error must fail, the layout must change whitespace only, a query whose result transform throws on no rows is still recorded).
- An optional caption goes under the panel: `<template #caption><span>…</span></template>` (`index.md`).

### The reference

Every export of `zapatos/db` (a member of `conditions` as `conditions.eq`), every option of its `Config` (`Config.transactionAttemptsMax`) and of the generator's (`generate.outDir`) has an entry: a heading of a Reference page that ends in its name as an anchor, `` ## `insert()` {#insert} `` (other attributes may follow it: `{#upsert .since}`). Only the page's own ATX headings count, outside fenced code and HTML comments: not a partial's (`<!--@include: -->`), nor a Setext or indented heading. Until its page is written, a name waits in `reference-pending.json`, under that page. `docs:build` runs `check-reference.mjs` after `tsc`: it reads the names from the built library's declarations, and fails on a name with neither, on a name anchored on two Reference pages, on a pending name that already has its entry, and on a pending name the library no longer has; each line says which page to add it to. So the list only shrinks:

- **A reference page's PR** writes an entry for each name of its page in `reference-pending.json`, then removes them from it.
- **A new export or option** fails the build until it has its entry, in the page the message names; its feature PR writes it.
- **A removed one** fails the build while its entry or its pending line remains.

### For assistants

At build, `.vitepress/llms.ts` writes two files to the site's root, from the outline and the pages, in its order ([llmstxt.org](https://llmstxt.org/)):

- `llms.txt`: `# pgcast`, a summary (the site's description and the home's lede), then one section per group, each written page with its URL and lede. So a page needs a `# ` title and a `{.lede}` paragraph, or the build fails.
- `llms-full.txt`: every written page as plain Markdown, each cast panel with the SQL, values and type `cast.data.ts` computes. A panel not written `<CastPanel example="<name>">` fails the build.

A "Coming" page has no `.md` file, so it is in neither; nor are the templates and this README, which the outline does not list.

### Screenshots for a PR

A PR that changes how a page looks shows it, in light and dark, at a phone's width (375px) and a desktop's: from `npm run docs:preview`, on a private artifact linked from **Proofs** (skill [`plan-and-proofs`](../.agents/skills/plan-and-proofs/SKILL.md) § Proofs), as `gh` cannot attach images. In the browser, they can go in the PR's description instead.

### Before the PR

- [ ] One job, the group's; its entry in `outline.ts`, a version badge if it documents a minor
- [ ] A `# ` title and a `{.lede}` paragraph
- [ ] Each export it documents: an entry anchored `{#name}`, its line gone from `reference-pending.json`
- [ ] Every example in the film world, as `ts twoslash`; a query's SQL in a cast panel
- [ ] Notes with a chip; options tables as Option → SQL it adds → Effect on the type
- [ ] Links to the other groups; British spelling
- [ ] `npm run docs:build` passes
- [ ] Screenshots of a new page, or of one that looks different

## The docs schema

`schema.sql`, pgcast's own example world: a film's cast (studios, films, actors and their roles, crew, cinemas, screenings, seat bookings, ratings, tags), every name invented, seeded rows from id 1000. The seeded screenings have fixed dates, in March 2030: an example filters on an explicit date, never on `now()`, so its result stays the same. `zapatos/` is generated from it by pgcast's own generator and committed, so a build needs no database; CI regenerates it and fails if anything differs. After a change to `schema.sql` or to the generator, regenerate it:

```sh
npm run build                  # at the root
cd website && npm run docs:schema
```

`docs:schema` loads `schema.sql` into a temporary `pgcast_test_<pid>_docs` database on the server of `TEST_DATABASE_URL` (the environment, else `src/.env`), runs `generate()`, and drops the database.
