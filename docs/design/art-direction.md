# Art direction of the documentation site

The look of pgcast's docs ([decision 004](../decisions/004-documentation-site.md)). The source of truth is the live site, <https://pgcast.dev>, and its theme, `website/.vitepress/theme/`; this page describes them. A change to the look changes this page first. The first prototype, approved by the owner in 2026-11, is in git's history (`docs/design/prototype.html`, removed 2026-11-13, #297).

## Identity

- **Wordmark**: **PG⟨mark⟩CAST**, the full logo: Postgres's cast operator, `::`, is the mark itself, the favicon's tile set between the two words as a seventh letter (`website/.vitepress/theme/Wordmark.vue`). The words are capitals of Saira, 700, `--fg`, letter-spacing `.04em`: a face of straight sides and rounded corners, the tile's own geometry. The tile is as tall as the capitals, so both stand on the baseline and share their middle: 14px in the top bar, where the letters are `calc(14px / .688)` (Saira's cap height is .688em), drawn there on a 14px grid (four 3px holes, 2px in, 4px apart) so that it stays sharp at 1x and 2x. The tile sits 2px from each word, the tracking after the G included. Its name is "pgcast"; what it shows is hidden from assistive technology. Lowercase was tried and set aside: its descenders and ascenders cannot be as tall as the tile and centred on it at once.
- **Its entrance**, the site's one brand moment, on the home only, the first time it loads in a session (`sessionStorage`; never on another page, even a session's first, nor on reaching the home by a client-side navigation, where the wordmark is already on screen; nor without storage; with `prefers-reduced-motion: reduce`, the final state at once). The tile settles in (opacity 0 → 1, scale .9 → 1, 600ms), then the letters come into focus one by one from the tile outward (opacity 0 → 1, `blur(.25em)` → none, 1300ms each, from 300ms): G and C first, then P and A 120ms later, S at 200ms, T at 250ms, gaps that shrink so they read as a wave. 1.85s in all, on one strong ease-out, `cubic-bezier(.23, 1, .32, 1)`. Opacity, transform and filter alone, never a layout property, so the letters keep their place and width from the first frame. The server renders the wordmark at rest: a pre-paint script sets `data-wordmark` on `<html>`, which the entrance's rules need, and `Wordmark.vue` removes it once the entrance is over, so it never replays. A slide of the words out of the tile behind a soft mask was tried and set aside.
- **Hero line**: "Your types, cast from your database::" (in French, « Vos types, castés depuis votre base de données:: »), the display face at 600, balanced over its lines (`text-wrap: balance`); the closing `::` in the mono face, 700, `--accent`, letter-spacing `-.06em`.
- **Eyebrow**, a SQL comment over a title, mono 500, 13px, `--accent`: the home's `-- a maintained fork of Zapatos 6.6.1` (back, amended 2026-11-14, #392), "Zapatos 6.6.1" a quiet link to Switch from Zapatos (underlined at 40% of its colour, in full on hover); the 404's `-- 404: 0 rows`.
- **pgcast on its own**: the site's description, its Open Graph, JSON-LD and `llms.txt` present pgcast, not a fork; the home credits the fork in its eyebrow alone, discreetly, not as a pitch. Zapatos is credited in the footer, the README and the licence; Switch from Zapatos is the last of the How-to guides, linked from Install and from the home's eyebrow.
- **Favicon**: the `::` cut out of a rounded square in `--accent` (radius 3/16 of its side), so the tab shows through the four dots: `website/public/favicon.svg`, light and dark. The social card, 1200×630, sets the wordmark (its tile 44px) and the hero line in the light theme, with no eyebrow: `website/public/social-card.svg`.
- **Accent**: one teal. Neutrals are greys biased toward it (blue-green), never pure grey.

## Colour tokens

Defined on `:root`, the dark values on `.dark` with `color-scheme: dark`. Three themes, VitePress's switch: **system** (the default), **light** and **dark**; the `.dark` class on `<html>` and the key `vitepress-theme-appearance` (`auto` · `light` · `dark`), because VitePress's pre-paint script reads only that key, and another one would flash the wrong theme on load. The theme button cycles system → light → dark. The browser's bar (`theme-color`) takes the top bar's `--surface` of the theme shown, `#ffffff` or `#121a21`, the reader's pick included (`Layout.vue`); the server's tags follow the system's.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f8f9` | `#0d1318` | page background |
| `--surface` | `#ffffff` | `#121a21` | top bar, nav drawer, panels, tables, notes, pager |
| `--sunken` | `#eef2f4` | `#0a0f13` | inline code, table headers, search field, plain chip, copy button hover |
| `--raised` | `#e4e7e9` | `#1e2429` | the nav's current page, the search's selected result, a pressed row, the page actions on hover or focus: `--fg` at 8% over `--bg` |
| `--fg` | `#12202b` | `#e2e9ee` | text |
| `--muted` | `#566673` | `#8d9eab` | secondary text, labels, captions, hover-type underline |
| `--line` | `#d9e0e5` | `#23303a` | borders and rules |
| `--accent` | `#0a6b63` | `#4fcfbf` | links, `::`, current section of "On this page", primary button, selected tab, focus ring |
| `--accent-fg` | `#ffffff` | `#06201d` | text on `--accent` |
| `--accent-soft` | `#dcefec` | `#11302c` | chips, hover-type highlight |
| `--accent-hover` | `#075750` | `#74ddd0` | a filled `--accent` control on hover (the primary button, Run) |
| `--warn` | `#8a5a00` | `#e8b65a` | Security chip and its border, the banner's text |
| `--warn-soft` | `#fbf0d9` | `#2c2412` | Security note, the banner |
| `--error` | `#b22e2e` | `#d96d6d` | an error line under a failing example (Twoslash's `// @errors`): its text and left border, on a 12.5% tint of it |
| `--code-bg` | `#f1f4f6` | `#0f171d` | code blocks |

Syntax tokens:

| Token | Light | Dark | Colours |
|---|---|---|---|
| `--k` | `#1458a8` | `#7fb6ff` | keywords (TS keywords; SQL keywords in capitals) |
| `--s` | `#8f5600` | `#e3b462` | strings |
| `--t` | `#0a6b63` | `#4fcfbf` | type names (the accent) |
| `--n` | `#b0245a` | `#f08ab3` | numbers |
| `--c` | `#626e79` | `#768794` | comments, upright |
| `--qi` | `#12202b` | `#e2e9ee` | SQL quoted identifiers (`"films"`), as plain text |
| `--p` | `#b0245a` | `#f08ab3` | SQL parameters (`$1`) and their values, in bold |

The backdrop behind the search dialog and the phone's nav drawer: `--fg` at 40% (light), black at 60% (dark).

Other tokens: `--radius: 10px` (the cast panel 14px; the home's buttons, the install field, the top bar's search and the 404's search pills, half their height, and what sits inside them nested, its radius the pill's less its room (#392); nav rows and the copy button 8px; inline code 4px, chips and the version pill `999px`); the top bar's height, `--vp-nav-height: 56px`.

## Type

| Face | Weights | Fallbacks | Used for |
|---|---|---|---|
| Schibsted Grotesk | 600 | `"Helvetica Neue", Arial, sans-serif` | headings (`h1`–`h3`): line-height 1.15, `text-wrap: balance` |
| Inter | 400, 500, 600 | `system-ui, -apple-system, "Segoe UI", sans-serif` | body, 15px / 1.65 |
| JetBrains Mono | 400, 500, 700 | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | code, eyebrows, tabs, panel tags, tooltips |
| Saira | 700 | the display face's | the wordmark alone: its six capitals P G C A S T, 1.3 KB, preloaded first, `font-display: block` |

The four are SIL OFL, each served from `website/public/fonts/` beside its licence (`theme/fonts.css` says how each file was made). Saira is by Omnibus-Type, <https://github.com/Omnibus-Type/Saira>, cut from Google Fonts' file to the wordmark's capitals at 700.

Headings share one weight, 600: the hierarchy is in their size. Letters are tightened only from the page title up.

| Element | Size |
|---|---|
| Hero `h1` | `clamp(2.5rem, 6vw, 4.5rem)` (`clamp(3rem, 5vw, 4.25rem)` from 1024px), 600, letter-spacing `-.025em`, balanced |
| Hero lede | 1.18rem, at most 58ch (62ch from 1024px) |
| Page `h1` | 2.5rem, 600, letter-spacing `-.01em` (2rem under 560px) |
| `h2` / `h3` | 1.5rem / 1.125rem, 600, letter-spacing 0 |
| Lede | 1.1rem, `--muted`, at most 62ch |
| Code blocks | 13px / 1.6, `tab-size: 2` |
| Inline code | `.88em` on `--sunken`, no border, radius 4px, padding `0 4px` |
| Nav | group headings in the headings' face, 16px / 24px, 600, `--fg`, sentence case, no letter-spacing; pages 14px / 20px, 400, `--muted` (`--fg` on hover, the current one `--fg`, 500) |
| "On this page" | its title 13px, 600, `--muted`, sentence case; its links 13px |
| Captions, edit row, footer | 13px |
| Hover-type tooltip | mono 12.5px / 1.5 |

No capitals for labels, no italics: comments included.

## Layout

Spacing is on a 4px grid.

- **Top bar**, sticky, 52px, compact (`--vp-nav-height`, by which VitePress offsets the content, the left nav and the local nav), on `--surface` with a bottom rule across the whole width (under 960px, VitePress's Menu bar under it opens the nav; under 768px, its menu button holds the links): wordmark, version pill, search (a 32px pill, as the home's buttons, on `--surface` with a `--line` hairline, its hover theirs, the border `--accent` on a 6% tint of it, #392; on a phone the icon alone, #391; `⌘K` or `/`: it reads "Search", its label "Search the docs"; the `⌘K` hint one keycap, as the search dialog's, its radius 10px nested in the pill, hidden under 1100px, and the text under 900px), links Tutorial · Guides · Reference · Playground · GitHub (`--muted`, 400, `--fg` on hover; the current group in `--fg` too; no external-link icon; 10px either side, so that Playground fits at 960px; hidden under 768px), theme button, 32px. Explanation is reached from the nav and the home: a fourth group link would push the theme button into VitePress's `⋯` menu at most widths from 768 to 1050px, with Playground and GitHub at 960px (measured on a page with the left nav). The changelog is linked from the footer.
- **Shell**, VitePress's, at most 1440px: left nav 260px · reading column, at most 688px · "On this page" rail, at most 256px, from 1280px. Gutters of 16px at least. No `viewport-fit=cover`, so the browser keeps the page out of a phone's notch, and no `env(safe-area-inset-*)`, which would be 0 without it.
- **Three columns on one line** (#392), from 960px: the nav's first heading, "On this page" and the page's title set their caps on one line, `--doc-top` (48px) under the top bar, and under VitePress's bar of "On this page" too from 960 to 1279px (52px), where the nav starts under it. Each column's top padding is that line less the room its first line leaves over its caps, measured on the site's faces: the title's 9.4px (40px at 1.15), the heading's 10.8px (14.8px in a 40px row), "On this page"'s 5.5px.
- **Left nav**, sticky, compact as a docs sidebar is (amended 2026-11-14, #379, after Cursor's docs: rows that touch, the space between groups, not between rows), in the four groups of Diátaxis (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § The site, which lists their pages): Tutorial · How-to guides · Reference · Explanation.
  - Each group folds (VitePress's own `collapsed`, set per group in `outline.ts`): Tutorial and Reference open, How-to guides and Explanation folded; the group of the current page always open, on the server-rendered page too.
  - A group's heading links its landing page: no band, no border, set apart from its pages by size and colour alone; a row of 32px (padding `4px 0`), its text in line with the nav's edge, and VitePress's chevron at its end, a 32px button (`aria-expanded`), `--muted`, `--fg` on hover, pointing down when open. A code name in it breaks anywhere rather than be cut.
  - Its pages a step further in, their text 16px right of the heading's: plain rows of 28px (padding `4px 12px`) that touch, radius 8px, no fill; 4px between the heading's row and its first page's, so 12px from the heading's text to the first page's, against 8px between pages. A row is a target of 28px, over WCAG 2.5.8's 24px; with a coarse pointer (`pointer: coarse`), a finger's 40px, headings and pages, the chevron as tall.
  - The current page a filled row, `--raised`, in `--fg`, 500; a current landing page fills its heading's row the same way.
  - 16px under an open group, 4px under a folded one; the same in the phone's drawer.
  - A page that documents a minor carries its version as a small badge on the right (Versions: 6.7).
- **Reading column**: paragraphs and list items at most 68ch; VitePress's padding (48px 32px from 960px).
- **Rhythm** of the reading column, on the 4px grid, moderate and even: breathing room, not empty space (`style.css`, last rule).

  | Between | Space |
  |---|---|
  | the text above and an `h2` | 48px (44px margin, 4px padding); 16px under it |
  | the text above and an `h3` | 24px; 12px under it |
  | paragraphs, lists | 16px |
  | list items | 8px; a nested list's items 4px |
  | the text and a block: code, table, cast panel, note, diagram, At a glance | 24px above and below; right under a heading, the heading's own space |

  - Body 15px / 1.65 and the 68ch measure, kept: a line of about 25px, and about 70 characters, inside the 45–75 a page reads best at.
  - The cast panel keeps its own style; only the space around it follows the rhythm.
- **"On this page"**: the page's `h2`s, the current one in `--accent` with an accent rule on its left.
- **Group landing pages** (`/tutorial`, `/guides`, `/reference`, `/explanation`): the title, the lede on what the group is for, then each page: its title, a link as every other in the docs (16px, 500, `--accent`, underlined 1px at 3px, 2px on hover), then its line, 4px under it, in `--muted`: the page's description, its lede cut as `meta.ts` cuts it (`groups.data.ts`). 20px between pages, 32px under the lede.
- **404 page** (`NotFound.vue`), on the reading column's width, 96px down (48px under 560px): the eyebrow `-- 404: 0 rows`; "Page not found" and a lede as a page's; a button that opens the search, a 40px pill on `--surface`, as the top bar's search, at most 320px; then the four groups of the outline and the home, as a landing page's links, 12px apart.
- **Breakpoints**: VitePress's (768 / 960 / 1280px) for the shell, the top bar and the nav, rather than fighting its layout: under 960px the nav becomes a drawer. The home grid, the notes, the page `h1` and the version pill keep 560 / 900px; the cast panel follows its own width (§ Signature components).
- **Home**, on a 1180px column, the page's one `<main>`. Its first screen shows the product, not a claim about it: the eyebrow, the line, the lede, the two actions and the install, then the cast panel rising under them, its top in the first screen.
  - The eyebrow (§ Identity) out of the hero's flow, so that nothing under it moves: in the room over the line, as far from the top bar as from the line, glyph to glyph (its cap top to the bar, its baseline to the line's caps), its hyphen's ink on the line's left edge.
  - Read in order, title, lede, actions, the same in either language (amended 2026-11-15, as the two-column hero squeezed the French line into three lines): the line across the column, balanced over two lines from 1024px (one where it fits, as the English at 1024px); 24px under it the lede (1.18rem, `--muted`, at most 62ch); 40px under it the two buttons, then 40px under them the install field, at most 512px: the buttons lead somewhere, the field is copied, so they do not share a row, and each block is as far from the last (16px under the buttons below 1024px); under 560px, the field becomes a card.
  - Two buttons, "Get started" (primary) and "Playground", 40px tall, padding `0 20px`, pills (radius 20px, #392); their hover a lift (§ Hover and press).
  - The install field (`InstallLine.vue`), as tall as the buttons, their radius, on `--sunken` with a `--line` border:
    - 4px in, a segment of tabs, one per package manager, npm · pnpm · yarn · bun, npm first and the default: each its mark alone (§ Icons, 14px), its name for assistive technology, 30px tall, padding `0 8px`, pills nested in the field's (15px), 2px apart; the picked one raised on `--surface` with a `--line` border, in `--fg`, the others `--muted`, `--line` behind them on hover. A `--line` rule after the segment.
    - The command, mono 13px, the package manager in `--t`, the rest in `--fg`, no `$`; at its end, a copy button, 30px, round, no border, `--line` behind it on hover; it copies the command shown, turns to a tick for 1.4s with "Copied" above its end (12px, `--muted`), and selects the command when the clipboard is refused.
    - Under 560px, a card (radius `--radius`, its tabs and copy 6px): the tabs, their names shown beside their marks, in a header row over a `--line` rule; the command under them, padding `12px 8px 12px 16px`, wrapping at a space, never cut, the button on its first line.
    - WAI-ARIA's tabs: arrows, Home and End pick a tab as they move the focus; Tab goes on to the copy button. The pick is remembered for every page and visit, with the code groups of package managers (§ Signature components).
  - Then the cast panel of films with their cast, its caption above it: what it shows on the left, "Hover a dashed name to see its type." on the right, 12px over the panel. Four pillars (Postgres is the source · SQL you can read · Values are parameters · Live playground), each an `h2` at 1rem, 600, its text, then where to go next, a link in `--accent`, 500, on one line across the row: How the catalog becomes types · The SQL of each shortcut · What pgcast guards against · Open the playground. Four "read next" links, one per group (four columns, two under 900px, one under 560px).
  - Rhythm: 80px over the line from 1024px, 72px under it (48px under 560px); 64px from the hero to the cast panel's caption from 1024px, 56px under it (32px under 560px); 56px between the sections under it; the pillars under a rule, 32px under it, 32px apart.
- **Footer**, on the home page and under every page: "pgcast is maintained by Alexandre Demartin. Zapatos and its original documentation are by George MacKerron. MIT licence. What changed in each version: the changelog.", each name linking to their GitHub profile, "changelog" to `/changelog`.

## Icons

One set, drawn in one place: `website/.vitepress/theme/icons.ts`, one drawing per meaning, lines on a 24px grid with a 2px round stroke in `currentColor` (brands' marks are their filled shapes, in the same 24px box and `currentColor`), inline SVG, `aria-hidden` (the text beside an icon names what it does; the theme button, an icon alone, has its `aria-label`). `Icon.vue` draws one in a component; `svg()` writes the same markup at build. 16px; 14px beside text under 13px; 18px in the theme button.

- **An icon only where it helps a reader find or recognise something**, never as decoration; no emoji. Brand marks only where a row takes the reader to that product, or names it: OpenAI's for Open in ChatGPT, Claude's for Open in Claude; npm's, pnpm's, Yarn's and Bun's on their tabs, in the home's install field and in the code groups of package managers (written at build, `codeGroups.ts`, 14px, 6px before the name); all from Simple Icons (CC0, versions in `icons.ts`).
- **Where**: the page actions (copy, check once copied, chevron, Markdown file, the OpenAI and Claude marks, external arrow); a note's chip, by kind (tip a lightbulb; info a clock, as the site's info notes are "Coming"; warning a triangle; danger an octagon); the pager's arrows; the playground's Run (play) and Share (link); the package managers' tabs (their marks); the install field's copy (copy, check once copied); the theme button (system, light, dark). VitePress's own are kept: the pencil of the edit link, the search icon of the 404.
- **Left without**: the nav's group headings, At a glance, the group pages' lists, the home's pillars and "read next" links, the footer, the "since" badges, "Open in playground": text alone already says what each is, and an icon on every row would be noise.

## Signature components

- **Cast panel**: what you write, what Postgres runs, what TypeScript knows, in one bordered panel, radius 14px, dashed dividers. Each column has a label (a paragraph, so no heading level is skipped) with a mono tag in an accent outline: `TS` You write · `SQL` Postgres runs · `::` TypeScript knows. The SQL column ends with its values row (`values ["cast"]`, dashed rule above). An optional caption row under it, 13px, `--muted`.
  - Its columns follow the panel's own width (container queries): three (`1.15fr 1fr 1fr`) from 1140px, the home's at 1280px and up, where what you write and the type fit their columns; from 900 to 1139px, what you write and the SQL side by side, the type below across both; one column under 900px, as in a page's reading column.
  - No line is cut: a line too long for its column wraps, and goes on under the line's own text, 2ch further in (a hanging indent, from each line's `--indent`, `lineIndents` in `syntax.ts`); a name longer than the column breaks anywhere. No three columns hold every line of the home's example at 1440px (the SQL wraps), nor one column the longest SQL of the reference, so wrapping, not scrolling, is the rule.
- **Playground** (`/playground`, [decision 005](../decisions/005-playground.md)): a cast panel whose first column is an editor, Monaco, in the site's colours: its theme is built from the tokens above (`--k --s --t --n --c --fg`, `--surface` behind the code, `--accent` cursor, `--accent-soft` selection, brackets as punctuation), light or dark with the page; no line numbers, guides or minimap, as a code block, and a long line wraps 2ch further in, as in the cast panel. The SQL and the type update as you type, highlighted as Shiki highlights them at build. Hovers and suggestions take the tooltip's look. Run (primary, a play icon) and Share (quiet, a link icon) end the SQL column's label, 24px tall. While a run is on Postgres, Run is `aria-busy` and its icon a 14px ring that turns (600ms, linear; with reduced motion, a ring that fades in and out). What Postgres answers is at most 70vh tall and scrolls inside its column (`overscroll-behavior: contain`), its label, with Run and Share, held at its top. An error the code does not catch shows once, under its query's `rejects`, and the note under it says "The code stopped here: it does not catch this error." On a phone, the panel is static, read-only, with a line saying the playground edits code on a computer.
- **Hover types**: a dashed `--muted` underline, `cursor: help`, `--accent-soft` on hover or focus; focusable from the keyboard. The tooltip: mono, `--surface`, border, soft shadow. Twoslash computes every type at build from the docs schema.
- **Code blocks**: on `--code-bg`, border, `--radius`; a code group has a 38px bar of tabs (npm · pnpm · yarn · bun, mono 12px, the selected one underlined in `--accent`), each tab one line, a package manager's mark 14px and 6px before its name, in the tab's colour; the bar scrolls sideways where the tabs do not fit, never wraps. VitePress's Copy button, shown on hover, and always, in place of the language, without a pointer that hovers. A code group whose tabs are all package managers opens on the one the reader last picked, there or in the home's install block (`localStorage`, key `pgcast-package-manager`; npm without it), and a pick in it is remembered (`packageManager.ts`).
- **Notes**: a chip, then the text, on `--surface` with a border, **no coloured side rail**. The chip starts the text's first line, a 20px pill centred on it, 8px before the text, and the lines under it start at its left edge (#392): its label in sentence case, 12px, 600, no tracked capitals ("Why the alias"). Chips: Opt-in (`--accent-soft`, `--accent`), Security (`--warn-soft`, `--warn`, a 1px `--warn` border, the note itself on `--warn-soft`), Coming (`--sunken`, `--muted`). Each opens on its kind's icon, 14px, in the chip's colour (§ Icons), written at build (`website/.vitepress/callouts.ts`).
- **Options tables**: bordered, radius, header on `--sunken`; the columns read Option → SQL it adds → Effect on the type; codes such as `PGCAST_DEP001` in mono, tabular figures.
  - A table of cases in `<div class="stack">` (`website/README.md` § Easy reading): its code breaks anywhere, so it fits the column; under 640px each row is a block on `--surface`, border, `--radius`, 12px apart, each cell under its header (12px, 600, `--muted`), the header row hidden but read.
- **At a glance**, under a long page's lede (`AtAGlance.vue`): a quiet tint, `--surface` with no border, `--radius`, padding `16px 20px`; its label "At a glance" as the nav's group labels (13px, 600, `--muted`, sentence case); then three bullets at most. No rail, no icon, no colour: it is a summary, not a warning.

### Diagrams

One per page at most, only where a flow is the point (a value → parameter → Postgres; the catalog → generator → `schema.d.ts` → your code; a retried transaction), never as decoration. `ValuesFlow.vue`, on the security page, is the model.

- **Inline SVG** in a component of `website/.vitepress/theme/`, no client-side diagram library; in a `<figure class="Diagram">`, with a caption under it (13px, `--muted`).
- **Tokens, not colours**: classes of `style.css` (`.Diagram .box`, `.accent`, `.label`, `.text`, `.code`, `.param`, `.arrow`, `.head`), so light and dark follow. Boxes on `--surface` with a `--line` border and radius 10; pgcast's own step on `--accent-soft` with an `--accent` border; labels 12px 600 `--muted`; code in the mono face, 13px; a parameter and its value in `--p`, bold, as in the cast panel; arrows 1.5px `--muted`.
- **Drawn top to bottom at 400 units wide**, shown at its size and narrower on a phone (`max-width: 100%`): about 90 % at 390px, where a column leaves 358px.
- **Accessible**: `role="img"`, `aria-labelledby` its `<title>` and `<desc>`, which say what the diagram shows; the shapes `aria-hidden`. Every fact it shows, the page's text says too.
- **Page actions**, on each written page of the outline (not the home, the changelog, the playground, the 404 or a "Coming" page; `PageActions.vue`): from 1280px, where "On this page" shows, under it in the rail, as Cursor's docs place it (amended 2026-11-14, #387): its left edge on the outline's rule, 16px under its last link, fixed with it, its focus ring inside the button, as the rail's box cuts what overflows it; under 1280px, beside the title, floated right, in line with its first line. Two in the layout, one shown at a time by a media query, the other `display: none`, so out of the accessibility tree. One quiet split button, 32px, `--surface`, a `--line` border, radius 8px, 13px `--muted` (`--fg` on `--raised` on hover: on `--surface`, `--sunken` would read as a hole in dark); 40px with a coarse pointer: a copy icon and "Copy page", then a chevron that opens a menu under it (over it where it would not fit), `--surface`, border, `--radius`, the tooltip's shadow (a darker one in dark, `0 8px 28px` black at 50%, as the hover types'), as wide as its longest row and inside a 320px screen: fixed, its right edge under the chevron's, so that from the rail it opens leftwards, over the reading column's edge, and always inside the viewport; it scales in from the chevron (`scale(.97)` and transparent to its place, 150ms, ease-out), and closes at once. Each row an icon (`--muted`), its name (14px, `--fg`) and under it what it does (13px, `--muted`, the row's `aria-describedby`, so that its name stays the name): Copy page, "Copy page as Markdown for LLMs" · View as Markdown, "Open this page as plain text" · Open in ChatGPT ↗ and Open in Claude ↗, "Ask about this page in …"; `--raised` on hover or keyboard focus (`:focus-visible`: a click that opens the menu fills no row), and pressed. "Copied" under it for 1.4s, as its icon crossfades to a tick (§ Motion). Under 560px, the icon alone. WAI-ARIA's menu button: arrows, Home, End, Escape.
- **Pager**: two bordered links, Previous and Next, each with the arrow of its way (14px, `--muted`), the border turning `--accent` on hover.
- **Edit row**: a top rule; "Edit this page on GitHub" on the left; on the right "Last updated: 13 November 2026", the date of the page's last commit, 13px, `--muted`.
- **Search** (amended 2026-11-14, #379, after Cursor's docs): VitePress's local search, restyled in CSS alone; nothing is sent anywhere.
  - The dialog: one panel, 640px wide at most, 12vh from the top, so it stays put as results come and go; `--surface`, a `--line` border, `--radius`, a soft shadow, over the backdrop. Full screen under 768px, with VitePress's back button.
  - The field: a row of 56px over a rule, a 16px search icon in `--muted`, the text 16px. One focus mark (#322): the field draws no ring, and while it has focus the rule under it is `--accent`, 2px.
  - Each result: its place in the page, the path of its headings, 12px `--muted` with small chevrons; its title, 14px, 500, `--fg`; then three lines of its text, 13px `--muted`, scrolled to the first match, so that its line shows whole between the two cut above and below, faded out over 4px. A query matches the pages that hold all its words (MiniSearch's `combineWith: 'AND'`), each allowed one typo in ten letters (`fuzzy: 0.1`, `trasaction`), and by prefix. Rows of 8px by 12px padding that touch, radius 8px; the selected one filled `--raised`, as the nav's current page. The list button in the field hides the text lines.
  - The match: no fill, `--fg`, underlined 2px in `--accent` at 3px.
  - "No results for …" centred, 14px `--muted`, 32px of room; with no query, the field and the keys alone.
  - The keys at the foot, over a rule: ↑ ↓ to navigate, ↵ to select, esc to close, 12px `--muted`; each key a keycap, 20px, mono 11px, `--sunken`, a `--line` border, radius 4px. Arrows, Enter and Escape as VitePress has them; Tab reaches the field's buttons, then the results.
- **Steps** (#379, after Cursor's docs): a page read in order numbers its `h2`s, `## 1. Set up the project` (First query, Switch from Zapatos); the number sits in a round marker, 28px, `--surface`, a `--line` border, mono 13px, 500, `--fg`, hung 40px left of the heading's text, so the steps read at a glance and a long one wraps under its own text (`steps.ts`). The heading's text stays "1. Set up the project", in "On this page" and the search.
- **Details**: `#` anchors on headings, shown on hover, hung left of the heading's first line, on its baseline, a step's left of its marker, hidden without a pointer that hovers; links underlined 1px at 3px offset, 2px on hover; focus ring 2px `--accent`, offset 2px; `prefers-reduced-motion` honoured.
- **Hover and press**, on every control of the chrome (the top bar's search, links, wordmark and theme button; the nav's rows and chevrons; "On this page"; the page actions; the code blocks' Copy and the code groups' tabs; the pager and the edit link; the footer's links; the 404's search; the playground's Run and Share; the home's buttons, install field and "read next"):
  - Hover only with a pointer that hovers, `@media (hover: hover) and (pointer: fine)` (#392): on a touch screen, a tapped control would keep its hover state. Focus rings are never gated. VitePress's menu button keeps its three lines at rest after a tap.
  - On hover, a colour step, in 150ms `ease`: a bordered control's border turns `--accent` (search, theme button, pager, "read next", the 404's search); a quiet one takes `--raised`, `--sunken` or `--line` behind it (page actions, Share, the install field's tabs and copy); a filled one deepens to `--accent-hover` (`#075750`, dark `#74ddd0`: Run); a text link's underline thickens to 2px; the wordmark's version pill turns `--accent`.
  - A button gives a little when pressed: `scale(.97)` in 160ms on `--ease-out`; the install field's small buttons `.94`; a pager card `.98`.
  - A row of a list fills at once with `--raised` when pressed (the nav's rows and headings, the page actions menu's rows, the search's results): VitePress makes the tap's highlight transparent, so this is the press's only sign. The nav's fades back in 150ms once released; the menu's and the results' at once, as the arrow keys move their fill.
  - The home's two buttons (#392; the cast's `::` that slid in after their label is gone: the label never moves): on hover, Get started deepens to `--accent-hover` and Playground's border turns `--accent` on a faint tint of it (6% over `--surface`); with a pointer that hovers and motion allowed, both lift 1px on a soft shadow that grows from none (`0 4px 12px -2px`, the accent at 40%, on the primary; `0 2px 8px -2px` at 20% on the secondary; black in dark, where a tint would glow), 150ms on `--ease-out`, the colours in 150ms `ease`. Pressed, `scale(.97)` and the shadow gone, in 100ms (faster than the release, within a press's 100–160ms); released, back in 150ms.
  - Reduced motion: the colour steps alone; no movement, no press scale (§ Motion).
- **Motion** (#392). Two curves, on `:root`: `--ease-out`, `cubic-bezier(.23, 1, .32, 1)`, for what moves in the page (presses, the page actions menu, the icons' crossfade, the wordmark's entrance), and `--ease-drawer`, `cubic-bezier(.32, .72, 0, 1)`, a sheet's, for the phone's nav drawer as it opens (500ms); it goes in 250ms on `--ease-out`. Under 300ms everywhere else.
  - Copy turns to a tick, and back, in a crossfade (page actions, the install field): the icon going out shrinks to `scale(.8)` and blurs 2px as it fades, the one coming in the reverse, 150ms on `--ease-out`.
  - Reduced motion (`prefers-reduced-motion: reduce`): nothing moves, and what changes still fades: transitions keep opacity, colours, borders, underlines, fills and shadows, never a transform; no smooth scroll. The phone's drawer fades out where it stands (200ms), then goes. The wordmark shows at rest; Run's ring fades in and out instead of turning.
- **Touch**: a tap acts at once on buttons, links and labels (`touch-action: manipulation`), and a long press on a button or a tab does not select its label (`user-select: none`; never on the text). With a coarse pointer, the targets a finger needs are 40px: the nav's rows, the page actions, the theme button.

## Voice

- George MacKerron's: warm, brief, first person where natural; British spelling.
- pgcast's own world for every example (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § Decision, 7): a film's cast, in `website/schema.sql`: `studios`, `films`, `actors` and their `roles`, `crew`, `cinemas`, `screenings`, `seat_bookings`, `ratings`, `tags`; snake_case columns. Every title and name invented; never an extract from a real project. Zapatos's `authors` and `books` stay for the tests' fixture and existing JSDoc.

## What to avoid

The looks of generated sites, which the site avoids on purpose:

- purple or blue gradients, glows, gradient text, glossy blobs;
- emoji as markers or icons, "New ✨" badges, pulsing elements;
- capitals with wide letter-spacing for labels; weight for hierarchy, where size does it;
- cards everywhere: cards are kept for the pager and the "read next" links; bordered chips for inline code;
- coloured accent rails down the side of notes;
- decoration that carries no information.
