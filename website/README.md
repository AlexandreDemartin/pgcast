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
- A page that documents a minor carries its version in its entry, glued to the text: `'Versions<small class="since">6.7</small>'`.

### Templates

One per group, in `templates/`, not published (`srcExclude` in `.vitepress/config.ts`): copy one to `<link>.md`, then replace its text.

- [tutorial.md](templates/tutorial.md): steps the reader follows, each with what they see.
- [how-to.md](templates/how-to.md): the task, its steps, a link to the entry of each option.
- [reference.md](templates/reference.md): one entry per export, its signature, its cast panel, its options table.
- [explanation.md](templates/explanation.md): prose sections, then the entries they discuss.

### Conventions

- **Title and lede**: one `# ` title, the text of its outline entry: one or two words, the concept's usual name (Conditions, Retries), no code; the function names and the detail go in the lede. Then one paragraph followed by `{.lede}` on its own line: what the page is for. `llms.txt` takes both (§ For assistants), and the page's description its lede (§ For search engines).
- **Headings**: `##` for sections ("On this page" lists them), `###` under them, in sentence case.
- **Notes**: a chip, then the text, with no side rail (art direction § Signature components). The text after the container's name is the chip, a word or two; a note is for what the reader must not miss.

  | Container | Chip | For |
  |---|---|---|
  | `::: tip Opt-in` | teal, a lightbulb | an opt-in, or a tip worth a box (`::: tip Why the alias`) |
  | `::: info Coming` | grey, a clock | what isn't there yet (`::: info Coming`, `why.md`) |
  | `::: warning Security` | amber, the note too, a triangle | a risk to the reader's data or queries |

- **Code**: a command in `sh`, a file in a `::: code-group` with its path as the label (`` ```ts twoslash [src/films.ts] ``), TypeScript as `ts twoslash` (§ Examples), except a signature, which does not compile on its own: plain `ts`.
- **Install commands**: yarn and bun take a range, the major under the `zapatos` alias, `zapatos@npm:@pgcast/pgcast@^6`, and the first release with `moduleNames` under pgcast's own name, `pgcast@npm:@pgcast/pgcast@^6.7` (`install.md`); `check-prose.mjs` fails on one, in a page or the root README, that is not the major of the root `package.json`.
- **Options tables**: the columns read Option → SQL it adds → Effect on the type, the option and its SQL in code, "none" when the type does not change. The SQL is what the built library compiles (`.compile().text`), never written from memory, and carries its probe (below).
  - A codegen page's options send no SQL: the summary table reads Option → Default → What it sets, each option linking its entry, and a table of an option's values reads Option → Effect on the output (on the type, when that is all it changes). Both are what the built CLI writes, never written from memory (`generator.md`).
- **SQL and messages in the text**: SQL a page gives as what pgcast writes, in its prose, a table or a `sql` block, and each pgcast message it quotes, carry a mark that `docs:build` checks (`check-prose.mjs`, no database). A failure names the page and the line.
  - `` `LIMIT $1`<!-- probe: db.select('films', db.all, { limit: 2 }) --> ``: the mark glued after the code span, never at the start of a line (VitePress would read an HTML block). The probe is a JavaScript expression with `db` and `pool` in scope, or a cast panel's example, `examples/select.ts`. Its SQL is a fragment's `.compile().text`, or each query a promise sends to `pool`, which records them and gives no rows: `db.serializable(pool, async () => {})`.
  - The span, `…` standing for any text, is in that SQL, whole words at its ends; one in parentheses, with every pair around it (`("a")` is not in `(("a"))`). Only a span that starts with `(` and ends with `)` is held to its pairs, as a condition entry shows its own pair without the Whereable's: `NOT (…)` passes where the SQL has `(NOT (…))`.
  - On the line above a `sql` block: the block's lines, `--` comments aside, are the queries the probe sends, all of them, whole and in that order.
  - `"nothing to update: …"<!-- message -->`, after a quote or a code span: the whole of a string or template literal of the built `zapatos/db`, `…` for a value or for text left out; a value given is one word (`retrying in 1ms`, not `1 ms`); a quote that shows `${attempt}` is the template literal's source, each `${…}` as written.
  - Any comment that starts as a mark is one: a mark the script cannot read fails. In a table, a mark holding a `|` fails, as markdown-it would end the cell there: write `'\x7c'`. Postgres's own messages and the SQL the reader writes are not marked. A probe is code the build runs: review a page's diff in source view.
- **Links**: root-relative, without `.md`: `[Install](/install)`, an entry as `` [`select()`](/select#select) ``. A link to a page that does not exist fails the build.
  - The hash is the anchor exactly as written: an entry's name, case and dots kept (`` [`Config.castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) ``, `` [`SelectResultMode`](#SelectResultMode) `` on its own page); a heading without `{#…}` by its slug, in lower case with hyphens (`## Insert options` → `#insert-options`). No raw `<a href>`.
  - The build also fails on a raw `<a href>` to a page that does not exist, on a link to an anchor that its page does not define (the part before a text fragment's `:~:`, if any), and on a root link outside the site's base, with the page and the link (`.vitepress/anchors.ts`). A link written with the site's host (`https://pgcast.dev/…`) is checked the same way. A name still in `reference-pending.json` counts as an anchor of its page, so a page can link an entry of a "Coming" page.
  - A URL of the site in a fenced block (`https://pgcast.dev/…`), such as the rules file of `ai-assistant.md` that readers copy into their projects, is checked the same way, page and anchor, and reported with its line. The home may be written without its slash.
  - A tutorial ends on the three other groups.
  - A how-to links each option it uses to its entry.
  - A reference entry links its explanation for the why.
  - An explanation links the entries it discusses.
- **Voice**: warm and brief, first person where natural, British spelling (`colour`, `behaviour`, `licence`), Zapatos rather than its author (skill [`code-style`](../.agents/skills/code-style/SKILL.md) § Docs voice).
- **The film world**: every example on the docs schema (§ The docs schema), every name invented, an explicit date rather than `now()`.

### Easy reading

A reader scans before reading, so a page breathes. Less is more: it keeps every fact and its voice, and adds structure only where it reads better than the prose it replaces (`switching.md` and `security.md` show each form):

| Content | Form |
|---|---|
| A page of over ~1,500 words | **At a glance** under the lede: three bullets at most, what the page answers or the rules to keep |
| A sequence | numbered steps; a how-to's steps as numbered headings, their anchor kept: `## 3. Compile {#compile}` |
| An enumeration | a list, one idea per item |
| A true grid: behaviour by case, before / after Zapatos, errors and what to do | a table, Zapatos 6.6.1 and pgcast in columns of their own |
| A flow that is the point | a diagram (art direction § Diagrams), one per page at most |
| Anything else | paragraphs of at most ~60 words, three sentences |

- When in doubt, a shorter paragraph is enough: a table of two short rows, or a list of two, is a sentence.
- Fewer words where the same fact can be said shorter, never a fact dropped.
- No new notes, chips, colours or decorations: a risk the reader must not miss gets the `::: warning Security` the site has.
- The spacing is the theme's (art direction § Layout, Rhythm): no `<br>`, no empty paragraph, no margin in a page.
- At a glance is a component, so "On this page" does not list it, and `llms-full.txt` gets it as `**At a glance**` and its list:

  ```md
  <AtAGlance>

  - Values travel as parameters, beside the SQL text.

  </AtAGlance>
  ```

- A table of three columns or more with long cells goes in `<div class="stack">` (blank lines around it): its code may break, so it fits the column, and on a phone each row is a block, each cell under its header.
- A diagram is a component of `.vitepress/theme/`, registered in `index.ts`. It holds no fact the page's text does not say, so `llms-full.txt` drops it, and its SQL is a span the page probes beside it.
- A page rewritten for reading lists, in its PR, each fact of the old page and where it went, with the words and the longest paragraph before and after.

### Examples

- A `ts twoslash` block is compiled against the built `zapatos/db` and the docs schema's `zapatos/schema`; hovers show the types TypeScript gives. An unexpected type error fails the build; a block meant to fail says so with `// @errors: <code>`.
- A hover names a package's module as the reader imports it (`typeof import("pg")`), where TypeScript prints its path on the build machine (`.vitepress/twoslash.ts`, `moduleNames`). After VitePress, `docs:build` fails on a machine's path in any built text file, hovers included (`check-paths.mjs`): this checkout's, or one that starts `/home/`, `/Users/`, `/runner/` or a drive letter. A path that a package's JSDoc gives as an example goes in its `allowed`.
- Twoslash reports only a block's own errors, so `docs:build` first runs `tsc` (`tsconfig.json`) on the docs schema and `examples/`: a stale schema fails there. Then `tsc -p .vitepress`, on the site's own code.
- **The cast panel** shows what you write, what Postgres runs and what TypeScript knows. It is for a query whose SQL and type the reader should see: a shortcut, an option that changes the SQL. Code that sends no query (a pool, a config, a type) is a plain `ts twoslash` block.
- A cast panel's example is a module in `examples/`, its imports above `// ---cut---`, hidden on the page (`examples/first-query.ts` is the shortest):

  ```md
  <CastPanel example="home">

  <<< ./examples/home.ts{ts twoslash}

  </CastPanel>
  ```

  At build, `.vitepress/cast.data.ts` runs it against a pool that only records the query `.run()` gets from `.compile()`: its SQL (laid out on lines, whitespace only) and values fill "Postgres runs". "TypeScript knows" is the type Twoslash gives the module's first `const` with no type written, the query's: its name, then one level down. So an example can type its input first (`const row: s.films.Insertable = …`, `examples/first-query-insert.ts`) and still show its result. Nothing in a panel is typed by hand; the loader checks itself before each build (a type error must fail, the layout must change whitespace only, a query whose result transform throws on no rows is still recorded, a configuration an example changes is put back whole). The examples share one `zapatos/db`: one may call `db.setConfig()`, or change `transactionRetryDelay` in place, and the loader puts the configuration back before the next.
- An example that sends more than one query, such as a transaction, cannot be a panel: it goes in `examples/plain/`, which `tsc` checks and `cast.data.ts` does not run, as `<<< ./examples/plain/<name>.ts{ts twoslash}`; the SQL it sends, where the page shows it, in a `sql` block: only the lines pgcast sends itself, such as `START TRANSACTION`, with a comment and a link for each query's own.
- Every example runs against Postgres in CI's `docs` job (`npm run docs:examples`, with `TEST_DATABASE_URL`), on the docs schema: a query that type-checks but that Postgres refuses fails, with the page and the line that include it. A panel's example runs between `BEGIN` and `ROLLBACK`; one in `examples/plain/`, which commits its own transactions, on its own copy of the database.
  - An example that shows an error says which, above `// ---cut---`: `// rejects with 42703` (a SQLSTATE) or `// rejects with NotExactlyOneError` (an error's name). It fails if it rejects with anything else, or not at all.
  - An example also fails if a promise it does not await rejects, or, in `examples/plain/`, if it leaves a client in use or a query waiting. One that does not settle within 10 s ends the run.
  - A name an example only declares (`declare const tags: …`) runs with a stand-in from `run-examples.mjs`; a new one goes there.
- Code a page shows in its own block and an example needs above its `// ---cut---`, such as a function it calls, goes between `// #region copy` and `// #endregion copy` (`examples/plain/paginate_handler.ts`). The build fails, in `.vitepress/llms.ts`, unless those lines are still a block of the page, blank lines aside: its code after `// ---cut---`, if it has one (`examples/plain/testing_fake.ts`).
- A page whose examples the reader keeps in one file, as the tutorial's `src/films.ts`, says so with a line `<!-- joined: src/films.ts -->` under its last step; any other line holding `<!-- joined` fails the build. `docs:build` checks the file (`check-joined.mjs`), and each error names the page and the line:
  - The code below `// ---cut---` of each `ts twoslash` block and `<<< ./examples/<name>.ts{ts twoslash}` (unindented) above it, up to the previous such line, is joined in page order and type-checked: a name declared twice or an import the page never gives fails.
  - A block that shows an error (`// @errors:`) stays out of the join, as the reader does not keep it. Its code is type-checked below the steps above it, in a `{ … }` of its own, and must give exactly the codes it lists: Twoslash checks it only against its own setup.
  - If the first `ts twoslash` block under the line is titled with the file (`ts twoslash [src/films.ts]`), it shows the whole file: it must be the join, imports in any order and blank lines aside.
- An optional caption goes under the panel: `<template #caption><span>…</span></template>` (`index.md`).
- On a docs page, the panel's code label ends with **Open in playground**, a link that opens its example in `/playground`, the code after `// ---cut---` and above it, deflated into `#code/…` at build (`.vitepress/playgroundLinks.ts`); its accessible name adds the heading above the panel (`Open in playground: Arrays, example 2`). None on the home nor on the playground. The playground gives the type of its code's first `const`; an example that runs a query above its cut, so that another `const` comes first, writes `// the playground gives the type of the next const` on the line above `// ---cut---` (`examples/paginate_keyset.ts`), or gets no link. After VitePress, the build decodes each link of the built pages as the playground does, and fails on a panel without its link, or whose link opens other code.

### The reference

Every export of `zapatos/db` (a member of `conditions` as `conditions.eq`), every option of its `Config` (`Config.transactionAttemptsMax`) and of the generator's (`generate.outDir`) has an entry: a heading of a Reference page that ends in its name as an anchor, `` ## `insert()` {#insert} `` (other attributes may follow it: `{#upsert .since}`). Only the page's own ATX headings count, outside fenced code and HTML comments: not a partial's (`<!--@include: -->`), nor a Setext or indented heading. Until its page is written, a name waits in `reference-pending.json`, under that page. `docs:build` runs `check-reference.mjs` after `tsc`: it reads the names from the built library's declarations, and fails on a name with neither, on a name anchored on two Reference pages, on a pending name that already has its entry, and on a pending name the library no longer has; each line says which page to add it to. So the list only shrinks:

- **A reference page's PR** writes an entry for each name of its page in `reference-pending.json`, then removes them from it.
- **A new export or option** fails the build until it has its entry, in the page the message names; its feature PR writes it.
- **A removed one** fails the build while its entry or its pending line remains.

### For assistants

At build, `.vitepress/llms.ts` writes two files to the site's root, from the outline and the pages, in its order ([llmstxt.org](https://llmstxt.org/)):

- `llms.txt`: `# pgcast`, a summary (the site's description and the home's lede), then one section per group, each written page with its URL and lede, and `## Optional`, the changelog. So a page needs a `# ` title and a `{.lede}` paragraph, or the build fails.
- `llms-full.txt`: every written page as plain Markdown, each cast panel with the SQL, values and type `cast.data.ts` computes. A panel not written `<CastPanel example="<name>">` fails the build.
- `/<page>.md` (`/index.md` for the home): each page's part of `llms-full.txt`, in a file of its own, listed nowhere. On each written page of the outline, under "On this page" from 1280px, else beside the title, its page actions (`.vitepress/theme/PageActions.vue`) copy it, link it, and open ChatGPT or Claude on a prompt that names its URL; nothing outside the site is fetched until one of those links is followed. In `docs:dev` the file does not exist: `docs:build` writes it.

A "Coming" page has no `.md` file, so it is in neither; nor are the templates and this README, which the outline does not list. The changelog is in `llms.txt` only.

### The changelog

`/changelog` and its Atom feed, `/changelog.xml`, are the root's `CHANGELOG.md`, read at build by `.vitepress/changelog.ts`: a change there needs no edit here, and CI's `docs` job builds on it.

- The page is `changelog.md`'s title and lede, then `CHANGELOG.md`'s intro and versions in place of `<!-- @changelog -->`; its "Last updated" is `CHANGELOG.md`'s last commit.
- A version is `## [Unreleased]` or `## [x.y.z] - yyyy-mm-dd`, anchored `#unreleased`, `#6.6.2`; each of its sections after it, `#6.6.2-security`. Any other `## ` heading fails the build.
- A link relative to the repository (`docs/decisions/…`) becomes its page on GitHub.
- The feed has one entry per released version, `[Unreleased]` aside: its date, its notes as HTML, its anchor on the page.

`public/robots.txt`, copied to the root as it is, lets every crawler in, assistants' included, and names `sitemap.xml`, which VitePress writes from the config's `sitemap`.

### For search engines

`.vitepress/meta.ts` gives each page's `<head>`:

- `description`: the front matter's, or else the lede as plain text, cut after the last whole sentence within 160 characters (the first sentence whatever its length). A "Coming" page takes the site's.
- A canonical URL on `https://pgcast.dev/`, Open Graph and a Twitter card, with the one social image, `public/social-card.png`; on the home, a JSON-LD `SoftwareSourceCode`.

`sitemap.xml` gives each page's `lastmod`, and the page its "Last updated", from git: CI checks out the whole history. The favicons, the Apple touch icon and the social card are drawn in SVG in `public/`; after changing one, `npm run docs:images` renders the PNG and ICO with headless Chrome (`CHROME=<path>` off macOS), to commit with it.

### Screenshots for a PR

A PR that changes how a page looks shows it, in light and dark, at a phone's width (375px) and a desktop's: from `npm run docs:preview`, on a private artifact linked from **Proofs** (skill [`plan-and-proofs`](../.agents/skills/plan-and-proofs/SKILL.md) § Proofs), as `gh` cannot attach images. In the browser, they can go in the PR's description instead.

- `docs:preview` keeps the file list it read at start-up: restart it after each rebuild, or the new hashed CSS gives 404.
- Headless Chrome stops at about 500px with `--window-size`: a phone's width goes through the DevTools protocol, `Emulation.setDeviceMetricsOverride` with `mobile: true`.
- The nav has no fixed breakpoints, it moves what does not fit into `⋯`: a change to its text is checked at every width from 768 to 1280px.
- A theme override is checked in the computed style: a default-theme component's scoped rules (`[data-v-…]` counts as a class) win without an error; read its `<style scoped>` first.

### Before the PR

- [ ] One job, the group's; its entry in `outline.ts`, a version badge if it documents a minor
- [ ] A `# ` title and a `{.lede}` paragraph
- [ ] Each export it documents: an entry anchored `{#name}`, its line gone from `reference-pending.json`
- [ ] Every example in the film world, as `ts twoslash`; a query's SQL in a cast panel, or a `sql` block for an example of several queries (`examples/plain/`)
- [ ] Notes with a chip; options tables as Option → SQL it adds → Effect on the type
- [ ] Paragraphs of at most ~60 words; At a glance, three bullets, on a page of over ~1,500 words; structure only where it reads better (§ Easy reading)
- [ ] Each SQL span of pgcast's and each pgcast message quoted, marked: `<!-- probe: … -->`, `<!-- message -->`
- [ ] Links to the other groups; British spelling
- [ ] Its French page, `fr/<page>.md`, says the same, marked with `npm run docs:translated -- <page>` (§ Languages)
- [ ] `npm run docs:build` passes, and `npm run docs:examples` if an example changed
- [ ] Screenshots of a new page, or of one that looks different

## Languages

The site is in English at the root and in French under `/fr/`, with VitePress's switcher in the nav, which goes to the same page in the other language, its `#…` kept. English is written first; **every docs change is made in both languages, in the same PR**. `docs:build` fails otherwise (`check-translations.mjs`), so the French site never lags behind.

- `fr/<page>.md` translates `<page>.md`. Its front matter names the English page as it translates it, by a hash: `english: 3f2a9c1b7d4e`. Once the French page says what the English one says, and is proofread (§ French), mark it: `npm run docs:translated -- <page>`, which also sets its French spacing (below). An English page that changes fails the build until then, and `git diff` of the English page shows what to carry over.
- The theme's words and the build's (cast panel, page actions, 404, footer, search, "Coming" pages, `llms.txt`) are in `.vitepress/words.ts`, one object per language that `Words` holds to the same keys; the outline's texts are in `outline.ts`, each `{ en, fr }`; a diagram's are in `words.ts` too (`diagrams.retry`). `docs:build` type-checks both files (`tsc -p .vitepress`), and fails on a French word without its French spacing.
- `/fr/llms.txt`, `/fr/llms-full.txt` and `/fr/<page>.md` are the French site's, as § For assistants. The changelog stays in English: `fr/changelog.md` says so above it.

### What the French page keeps

The build compares each French page with its English page, by VitePress's own parser, and fails on the first difference, naming it:

| The French page keeps | As |
|---|---|
| Each heading's anchor | the English one, written after the French heading: `## Les options {#options}`. `node check-translations.mjs --anchors <page>` lists them |
| Each code block and include | byte for byte, comments too; an include is read from `fr/`: `<<< ../examples/select.ts{ts twoslash}` |
| Each note, component and cast panel | the same, in the same order: `::: tip`, `<CastPanel example="…">`; a note's chip and a panel's caption are translated |
| Each mark | `<!-- probe: … -->`, `<!-- message -->`, `<!-- joined: … -->`, and the code span glued before it, which `check-prose.mjs` checks on both pages |
| Each link to the site | from the root, under `/fr/`, its anchor kept: `` [`select()`](/fr/select#select) ``. A file of the site keeps its path (`/changelog.xml`) |

### French

- **Voice**: the English voice, in French: warm and brief, *vous*, first person where the English has it. A natural sentence before a word-for-word one; every fact kept, none added.
- **Typography**: a non-breaking space (U+00A0) before `:`, `;`, `?` and `!`, and inside « », which `docs:translated` puts in the prose and the build checks; `’` as the apostrophe; « » for a quote.
- **Words**: code stays code (`Selectable`, `upsert()`, `Whereable`); the rest in French, the same word for the same thing on every page:

  | English | French |
  |---|---|
  | shortcut | raccourci |
  | query, row, column | requête, ligne, colonne |
  | the docs, the docs schema | la doc, le schéma de la doc |
  | batch, retry, attempt | lot, nouvelle tentative, tentative |
  | join, lateral | jointure, lateral |
  | reject, resolve (a promise) | est rejetée, se résout |
  | custom type, generator | type personnalisé, générateur |
  | the `sql` template, a fragment | le template `sql`, un fragment |
  | tutorial, how-to guide, reference, explanation | tutoriel, guide pratique, référence, explication |
  | a note's chip: Opt-in, Coming, Security | Opt-in, À venir, Sécurité |
  | an options table: Option → SQL it adds → Effect on the type, none | Option → SQL ajouté → Effet sur le type, aucun |
  | cast panel | panneau cast |
  | callback, handler, snapshot, opt-in, skill | le callback, le handler, le snapshot, l’opt-in, le skill |
  | commit, roll back (a transaction) | valider, annuler (`COMMIT` and `ROLLBACK` stay SQL) |
  | check out, release (a client) | emprunter, libérer |
  | isolation level | niveau d’isolation |
  | throw, warning | lever une erreur, avertissement |
  | type-check | passer la vérification de types |
  | keyset pagination, ties | pagination par clés (keyset), ex æquo |
  | range (the Postgres types), a range of `between()` | type range, plage (`interval` is another type) |
  | a Postgres notice, a tagline, a mock | un avis, une accroche, un mock |
  | placeholder (`zapatos/custom/`) | fichier à compléter |
  | foreign table, materialised view, enum label | table distante, vue matérialisée, libellé |
  | listener, pattern | écouteur, motif |
  | a request (HTTP) | une requête HTTP, never a bare « requête », which is a query |
  | a cast (`::type`), to cast | un cast, caster |
  | catch, narrow (a type), in scope | intercepter, restreindre, à portée |
  | splice SQL (a hole), match (a condition, an error) | injecter du SQL, correspondre à |
  | the default (value), the kind (of a relation), the layout (of files) | la valeur par défaut, la nature, l’arborescence |
  | an error class (`DatabaseError`, `TypeError`) | feminine, as « une erreur »: une `DatabaseError` |
  | canary (`SchemaVersionCanary`), set from `EXCLUDED` | canary, prendre sa valeur dans `EXCLUDED` |
  | retry (a transaction), rethrow (an error) | relancer, lever de nouveau |
  | a fake, to fake, seeds | un faux, simuler, lignes de départ |
  | tagged template, top-level await, built-in object | template étiqueté, `await` de premier niveau, objet natif |
  | chunk (of a batch), deadlock, a no-op fragment | paquet, interblocage, un fragment sans effet |
  | own enumerable keys, the boxes `Number`, `String`, `Boolean` | propres clés énumérables, objets enveloppes |
  | an array-like object, a host object, to spread | un objet semblable à un tableau, un objet hôte, étaler |
  | the arbiter (`ON CONFLICT`), nullable | l’arbitre, peut être `NULL` |
  | a `Date`, Off / On (a table's columns), from 6.7.0, 6.6.2 is | un `Date`, Désactivé / Activé, à partir de la 6.7.0, la 6.6.2 est |
  | a near-miss (TS2820), the `*ForTable` lookups, written inline, refuses it bare | une faute proche, les correspondances, écrit en ligne, le refuse sans parenthèses |
  | identity map, realm, runtime, namespace, worker, template literal type, peer dependencies | kept in English |
- **Headings**: in the infinitive where the English gives an order (`## Book inside a larger transaction` → `## Réserver dans une transaction plus large`), so a reference to a heading reads as the heading.
- **Links**: to the French site's own files where it has them (`/fr/llms.txt`, `/fr/llms-full.txt`); a fenced block, copied as it is, keeps its English URLs.
- **Kept in English**: a pgcast message, as `zapatos/db` writes it, quoted or in a code span as on the English page; the changelog's section names (§ Fixed); any other quote in English, a line of Zapatos's docs or a message of Postgres or Node, in « » and in `<span lang="en">…</span>`, which keeps its English typography and is read in English: `« <span lang="en">there is already a transaction in progress</span> »`.
- **Proofread**: a translation is read again before it is marked, by someone or an agent that did not write it: against this glossary and the English page, for the words, the turns of phrase and a reference to another page's heading (`§ Pourquoi l’alias`), which must be that heading's French text.

## The docs schema

`schema.sql`, pgcast's own example world: a film's cast (studios, films, actors and their roles, crew, cinemas, screenings, seat bookings, ratings, tags), every name invented, seeded rows from id 1000. The seeded screenings have fixed dates, in March 2030: an example filters on an explicit date, never on `now()`, so its result stays the same. `zapatos/` is generated from it by pgcast's own generator and committed, so a build needs no database; CI regenerates it and fails if anything differs. After a change to `schema.sql` or to the generator, regenerate it:

```sh
npm run build                  # at the root
cd website && npm run docs:schema
```

`docs:schema` loads `schema.sql` into a temporary `pgcast_test_<pid>_docs` database on the server of `TEST_DATABASE_URL` (the environment, else `src/.env`), runs `generate()`, and drops the database. It and `docs:examples` first drop the `pgcast_test_<pid>_docs` databases of a run whose process is gone (stopped by Ctrl-C, killed, or crashed).
