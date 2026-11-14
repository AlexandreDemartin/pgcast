# Art direction of the documentation site

The look of pgcast's docs ([decision 004](../decisions/004-documentation-site.md)). The source of truth is the live site, <https://pgcast.dev>, and its theme, `website/.vitepress/theme/`; this page describes them. A change to the look changes this page first. The first prototype, approved by the owner in 2026-11, is in git's history (`docs/design/prototype.html`, removed 2026-11-13, #297).

## Identity

- **Wordmark**: `pg::cast`, in the mono face, 700, 19px, letter-spacing `-.02em`; the `::` (Postgres's cast operator) in `--accent`, with 1px either side.
- **Hero line**: "Your types, cast from your database::", the display face at 600; the closing `::` in the mono face, 700, `--accent`, letter-spacing `-.06em`.
- **Eyebrow**, a SQL comment over a title, mono 500, 13px, `--accent`: the 404's `-- 404: 0 rows`. The home has none.
- **pgcast on its own**: the home, the site's description and `llms.txt` present pgcast, not a fork. Zapatos is credited in the footer, the README and the licence; Switch from Zapatos is the last of the How-to guides, linked from Install.
- **Favicon**: the `::` cut out of a rounded square in `--accent` (radius 3/16 of its side), so the tab shows through the four dots: `website/public/favicon.svg`, light and dark. The social card, 1200×630, sets the wordmark, eyebrow and hero line in the light theme: `website/public/social-card.svg`.
- **Accent**: one teal. Neutrals are greys biased toward it (blue-green), never pure grey.

## Colour tokens

Defined on `:root`, the dark values on `.dark` with `color-scheme: dark`. Three themes, VitePress's switch: **system** (the default), **light** and **dark**; the `.dark` class on `<html>` and the key `vitepress-theme-appearance` (`auto` · `light` · `dark`), because VitePress's pre-paint script reads only that key, and another one would flash the wrong theme on load. The theme button cycles system → light → dark.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f8f9` | `#0d1318` | page background |
| `--surface` | `#ffffff` | `#121a21` | top bar, nav drawer, panels, tables, notes, pager |
| `--sunken` | `#eef2f4` | `#0a0f13` | inline code, table headers, search field, plain chip, copy button hover |
| `--raised` | `#e4e7e9` | `#1e2429` | the nav's current page and the search's selected result: `--fg` at 8% over `--bg` |
| `--fg` | `#12202b` | `#e2e9ee` | text |
| `--muted` | `#566673` | `#8d9eab` | secondary text, labels, captions, hover-type underline |
| `--line` | `#d9e0e5` | `#23303a` | borders and rules |
| `--accent` | `#0a6b63` | `#4fcfbf` | links, `::`, current section of "On this page", primary button, selected tab, focus ring |
| `--accent-fg` | `#ffffff` | `#06201d` | text on `--accent` |
| `--accent-soft` | `#dcefec` | `#11302c` | chips, hover-type highlight |
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

Other tokens: `--radius: 10px` (the cast panel 14px, buttons 9px, nav rows and the copy button 8px, inline code 4px, chips and the version pill `999px`); the top bar's height, `--vp-nav-height: 56px`.

## Type

| Face | Weights | Fallbacks | Used for |
|---|---|---|---|
| Schibsted Grotesk | 600 | `"Helvetica Neue", Arial, sans-serif` | headings (`h1`–`h3`): line-height 1.15, `text-wrap: balance` |
| Inter | 400, 500, 600 | `system-ui, -apple-system, "Segoe UI", sans-serif` | body, 15px / 1.65 |
| JetBrains Mono | 400, 500, 700 | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | code, the wordmark, eyebrows, tabs, panel tags, tooltips |

Headings share one weight, 600: the hierarchy is in their size. Letters are tightened only from the page title up.

| Element | Size |
|---|---|
| Hero `h1` | `clamp(2.5rem, 6vw, 4.5rem)`, 600, letter-spacing `-.025em`, at most 16ch |
| Hero lede | 1.18rem, at most 58ch |
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

- **Top bar**, sticky, 56px, on `--surface` with a bottom rule across the whole width (under 960px, VitePress's Menu bar under it opens the nav; under 768px, its menu button holds the links): wordmark, version pill, search (`⌘K` or `/`: the button reads "Search", its label "Search the docs"; the `⌘K` hint one keycap, as the search dialog's, hidden under 1100px, and the text under 900px), links Tutorial · Guides · Reference · Playground · GitHub (`--muted`, 400, `--fg` on hover; the current group in `--fg` too; no external-link icon; 11px either side, so that Playground fits at 960px; hidden under 768px), theme button. Explanation is reached from the nav and the home: a fourth group link would push the theme button into VitePress's `⋯` menu at most widths from 768 to 1050px, with Playground and GitHub at 960px (measured on a page with the left nav). The changelog is linked from the footer.
- **Shell**, VitePress's, at most 1440px: left nav 260px · reading column, at most 688px · "On this page" rail, at most 256px, from 1280px. Gutters of 16px at least, and the safe-area insets.
- **Left nav**, sticky, compact as a docs sidebar is (amended 2026-11-14, #379, after Cursor's docs: rows that touch, the space between groups, not between rows), in the four groups of Diátaxis (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § The site, which lists their pages): Tutorial · How-to guides · Reference · Explanation.
  - Each group folds (VitePress's own `collapsed`, set per group in `outline.ts`): Tutorial and Reference open, How-to guides and Explanation folded; the group of the current page always open, on the server-rendered page too.
  - A group's heading links its landing page: no band, no border, set apart from its pages by size and colour alone; a row of 32px (padding `4px 0`), its text in line with the nav's edge, and VitePress's chevron at its end, a 32px button (`aria-expanded`), `--muted`, `--fg` on hover, pointing down when open.
  - Its pages a step further in, their text 16px right of the heading's: plain rows of 28px (padding `4px 12px`) that touch, radius 8px, no fill; 4px between the heading's row and its first page's, so 12px from the heading's text to the first page's, against 8px between pages. A row is a target of 28px, over WCAG 2.5.8's 24px on a phone.
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
- **404 page** (`NotFound.vue`), on the reading column's width, 96px down (48px under 560px): the eyebrow `-- 404: 0 rows`; "Page not found" and a lede as a page's; a button that opens the search, 40px, as the top bar's search field, at most 320px; then the four groups of the outline and the home, as a landing page's links, 12px apart.
- **Breakpoints**: VitePress's (768 / 960 / 1280px) for the shell, the top bar and the nav, rather than fighting its layout: under 960px the nav becomes a drawer. The home grid, the notes, the page `h1` and the version pill keep 560 / 900px; the cast panel follows its own width (§ Signature components).
- **Home**, on a 1180px column, the page's one `<main>`:
  - The hero: line, lede, then two buttons, "Get started" (primary) and "Playground", 40px tall, padding `0 20px`; under them, 16px down, the install block (`InstallLine.vue`), at most 480px wide:
    - A tab per package manager, npm · pnpm · yarn · bun, npm first and the default: mono 500, 13px, 28px tall, padding `0 10px`, radius 8px, 4px apart; the picked one a filled pill, `--line` behind `--fg`, the others plain `--muted` text, `--fg` on hover. On their right, "Copied" for 1.4s after a copy, 12px, `--muted`.
    - 8px under them, the command in its own panel: `--sunken`, a `--line` border, `--radius`, padding `20px 24px` (16px under 560px); mono 14px / 22px, the package manager in `--t`, the rest in `--fg`, no `$`. At its end, a copy icon button, 28px, no border (16px icon, 2px stroke on a 24px grid, as the theme button's), `--line` behind it on hover; it copies the command shown, turns to a tick for 1.4s, and selects the command when the clipboard is refused. Where the command does not fit, on a phone, it wraps at a space, never cut, the button on its first line.
    - WAI-ARIA's tabs: arrows, Home and End pick a tab as they move the focus; Tab goes on to the copy button. The pick is remembered for every page and visit, with the code groups of package managers (§ Signature components).
  - Then the cast panel of films with their cast; four pillars (Postgres is the source · SQL you can read · Values are parameters · Live playground), each an `h2` at 1rem, 600; four "read next" links, one per group (four columns, two under 900px, one under 560px).
  - Rhythm: 72px over the line (48px under 560px); line 20px, lede 28px over the buttons; 48px from the hero to the cast panel (32px under 560px); 56px between the sections under it; the pillars under a rule, 32px under it, 32px apart.
- **Footer**, on the home page and under every page: "pgcast is maintained by Alexandre Demartin. Zapatos and its original documentation are by George MacKerron. MIT licence. What changed in each version: the changelog.", each name linking to their GitHub profile, "changelog" to `/changelog`.

## Icons

One set, drawn in one place: `website/.vitepress/theme/icons.ts`, one drawing per meaning, lines on a 24px grid with a 2px round stroke in `currentColor` (the ChatGPT and Claude marks are their brands' filled shapes, in the same 24px box and `currentColor`), inline SVG, `aria-hidden` (the text beside an icon names what it does; the theme button, an icon alone, has its `aria-label`). `Icon.vue` draws one in a component; `svg()` writes the same markup at build. 16px; 14px beside text under 13px; 18px in the theme button. The install line's copy button (`InstallLine.vue`) still draws its own.

- **An icon only where it helps a reader find or recognise something**, never as decoration; no emoji. Brand marks only where a row takes the reader to that product: OpenAI's for Open in ChatGPT, Claude's for Open in Claude, from Simple Icons (sources in `icons.ts`).
- **Where**: the page actions (copy, check once copied, chevron, Markdown file, the OpenAI and Claude marks, external arrow); a note's chip, by kind (tip a lightbulb; info a clock, as the site's info notes are "Coming"; warning a triangle; danger an octagon); the pager's arrows; the playground's Run (play) and Share (link); the theme button (system, light, dark). VitePress's own are kept: the pencil of the edit link, the search icon of the 404.
- **Left without**: the nav's group headings, At a glance, the group pages' lists, the home's pillars and "read next" links, the footer, the "since" badges, "Open in playground": text alone already says what each is, and an icon on every row would be noise.

## Signature components

- **Cast panel**: what you write, what Postgres runs, what TypeScript knows, in one bordered panel, radius 14px, dashed dividers. Each column has a label (a paragraph, so no heading level is skipped) with a mono tag in an accent outline: `TS` You write · `SQL` Postgres runs · `::` TypeScript knows. The SQL column ends with its values row (`values ["cast"]`, dashed rule above). An optional caption row under it, 13px, `--muted`.
  - Its columns follow the panel's own width (container queries): three (`1.15fr 1fr 1fr`) from 1140px, the home's at 1280px and up, where what you write and the type fit their columns; from 900 to 1139px, what you write and the SQL side by side, the type below across both; one column under 900px, as in a page's reading column.
  - No line is cut: a line too long for its column wraps, and goes on under the line's own text, 2ch further in (a hanging indent, from each line's `--indent`, `lineIndents` in `syntax.ts`); a name longer than the column breaks anywhere. No three columns hold every line of the home's example at 1440px (the SQL wraps), nor one column the longest SQL of the reference, so wrapping, not scrolling, is the rule.
- **Playground** (`/playground`, [decision 005](../decisions/005-playground.md)): a cast panel whose first column is an editor, Monaco, in the site's colours: its theme is built from the tokens above (`--k --s --t --n --c --fg`, `--surface` behind the code, `--accent` cursor, `--accent-soft` selection, brackets as punctuation), light or dark with the page; no line numbers, guides or minimap, as a code block, and a long line wraps 2ch further in, as in the cast panel. The SQL and the type update as you type, highlighted as Shiki highlights them at build. Hovers and suggestions take the tooltip's look. Run (primary, a play icon) and Share (quiet, a link icon) end the SQL column's label, 24px tall. On a phone, the panel is static, read-only, with a line saying the playground edits code on a computer.
- **Hover types**: a dashed `--muted` underline, `cursor: help`, `--accent-soft` on hover or focus; focusable from the keyboard. The tooltip: mono, `--surface`, border, soft shadow. Twoslash computes every type at build from the docs schema.
- **Code blocks**: on `--code-bg`, border, `--radius`; a code group has a 38px bar of tabs (npm · pnpm · yarn · bun, mono 12px, the selected one underlined in `--accent`); VitePress's Copy button. A code group whose tabs are all package managers opens on the one the reader last picked, there or in the home's install block (`localStorage`, key `pgcast-package-manager`; npm without it), and a pick in it is remembered (`packageManager.ts`).
- **Notes**: a chip, then the text, on `--surface` with a border, **no coloured side rail**. Chips: Opt-in (`--accent-soft`, `--accent`), Security (`--warn-soft`, `--warn`, a 1px `--warn` border, the note itself on `--warn-soft`), Coming (`--sunken`, `--muted`). Each opens on its kind's icon, 14px, in the chip's colour (§ Icons), written at build (`website/.vitepress/callouts.ts`).
- **Options tables**: bordered, radius, header on `--sunken`; the columns read Option → SQL it adds → Effect on the type; codes such as `PGCAST_DEP001` in mono, tabular figures.
  - A table of cases in `<div class="stack">` (`website/README.md` § Easy reading): its code breaks anywhere, so it fits the column; under 640px each row is a block on `--surface`, border, `--radius`, 12px apart, each cell under its header (12px, 600, `--muted`), the header row hidden but read.
- **At a glance**, under a long page's lede (`AtAGlance.vue`): a quiet tint, `--surface` with no border, `--radius`, padding `16px 20px`; its label "At a glance" as the nav's group labels (13px, 600, `--muted`, sentence case); then three bullets at most. No rail, no icon, no colour: it is a summary, not a warning.

### Diagrams

One per page at most, only where a flow is the point (a value → parameter → Postgres; the catalog → generator → `schema.d.ts` → your code; a retried transaction), never as decoration. `ValuesFlow.vue`, on the security page, is the model.

- **Inline SVG** in a component of `website/.vitepress/theme/`, no client-side diagram library; in a `<figure class="Diagram">`, with a caption under it (13px, `--muted`).
- **Tokens, not colours**: classes of `style.css` (`.Diagram .box`, `.accent`, `.label`, `.text`, `.code`, `.param`, `.arrow`, `.head`), so light and dark follow. Boxes on `--surface` with a `--line` border and radius 10; pgcast's own step on `--accent-soft` with an `--accent` border; labels 12px 600 `--muted`; code in the mono face, 13px; a parameter and its value in `--p`, bold, as in the cast panel; arrows 1.5px `--muted`.
- **Drawn top to bottom at 400 units wide**, shown at its size and narrower on a phone (`max-width: 100%`): about 90 % at 390px, where a column leaves 358px.
- **Accessible**: `role="img"`, `aria-labelledby` its `<title>` and `<desc>`, which say what the diagram shows; the shapes `aria-hidden`. Every fact it shows, the page's text says too.
- **Page actions**, on each written page of the outline (not the home, the changelog, the playground, the 404 or a "Coming" page; `PageActions.vue`): from 1280px, where "On this page" shows, under it in the rail, as Cursor's docs place it (amended 2026-11-14, #387): its left edge on the outline's rule, 16px under its last link, fixed with it, its focus ring inside the button, as the rail's box cuts what overflows it; under 1280px, beside the title, floated right, in line with its first line. Two in the layout, one shown at a time by a media query, the other `display: none`, so out of the accessibility tree. One quiet split button, 32px, `--surface`, a `--line` border, radius 8px, 13px `--muted` (`--fg` on `--sunken` on hover): a copy icon and "Copy page", then a chevron that opens a menu under it (over it where it would not fit), `--surface`, border, `--radius`, the tooltip's shadow, as wide as its longest row and inside a 320px screen: fixed, its right edge under the chevron's, so that from the rail it opens leftwards, over the reading column's edge, and always inside the viewport; it scales in from the chevron (`scale(.97)` and transparent to its place, 150ms, ease-out), and closes at once. Each row an icon (`--muted`), its name (14px, `--fg`) and under it what it does (13px, `--muted`, the row's `aria-describedby`, so that its name stays the name): Copy page, "Copy page as Markdown for LLMs" · View as Markdown, "Open this page as plain text" · Open in ChatGPT ↗ and Open in Claude ↗, "Ask about this page in …"; `--sunken` on hover or focus. "Copied" under it for 1.4s. Under 560px, the icon alone. WAI-ARIA's menu button: arrows, Home, End, Escape.
- **Pager**: two bordered links, Previous and Next, each with the arrow of its way (14px, `--muted`), the border turning `--accent` on hover.
- **Edit row**: a top rule; "Edit this page on GitHub" on the left; on the right "Last updated: 13 November 2026", the date of the page's last commit, 13px, `--muted`.
- **Search** (amended 2026-11-14, #379, after Cursor's docs): VitePress's local search, restyled in CSS alone; nothing is sent anywhere.
  - The dialog: one panel, 640px wide at most, 12vh from the top, so it stays put as results come and go; `--surface`, a `--line` border, `--radius`, a soft shadow, over the backdrop. Full screen under 768px, with VitePress's back button.
  - The field: a row of 56px over a rule, a 16px search icon in `--muted`, the text 16px. One focus mark (#322): the field draws no ring, and while it has focus the rule under it is `--accent`, 2px.
  - Each result: its place in the page, the path of its headings, 12px `--muted` with small chevrons; its title, 14px, 500, `--fg`; then two lines of its text, 13px `--muted`, scrolled to the first match, the lines cut above and below faded out. Rows of 8px by 12px padding that touch, radius 8px; the selected one filled `--raised`, as the nav's current page. The list button in the field hides the text lines.
  - The match: no fill, `--fg`, underlined 2px in `--accent` at 3px.
  - "No results for …" centred, 14px `--muted`, 32px of room; with no query, the field and the keys alone.
  - The keys at the foot, over a rule: ↑ ↓ to navigate, ↵ to select, esc to close, 12px `--muted`; each key a keycap, 20px, mono 11px, `--sunken`, a `--line` border, radius 4px. Arrows, Enter and Escape as VitePress has them; Tab reaches the field's buttons, then the results.
- **Steps** (#379, after Cursor's docs): a page read in order numbers its `h2`s, `## 1. Set up the project` (First query, Switch from Zapatos); the number sits in a round marker, 28px, `--surface`, a `--line` border, mono 13px, 500, `--fg`, hung 40px left of the heading's text, so the steps read at a glance and a long one wraps under its own text (`steps.ts`). The heading's text stays "1. Set up the project", in "On this page" and the search.
- **Details**: `#` anchors on headings, shown on hover; links underlined 1px at 3px offset, 2px on hover; focus ring 2px `--accent`, offset 2px; `prefers-reduced-motion` honoured.

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
