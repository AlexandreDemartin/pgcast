# Art direction of the documentation site

The source of truth for the look of pgcast's docs, whatever tool builds them ([decision 004](../decisions/004-documentation-site.md)). Approved by the owner on the [prototype](prototype.html) (open it locally); its CSS holds every value below. A change to the look changes this page first.

## Identity

- **Wordmark**: `pg::cast`, in the mono face, 700, 19px, letter-spacing `-.02em`; the `::` (Postgres's cast operator) in `--accent`, with 1px either side.
- **Hero line**: "Your types, cast from your database::", the display face at 800; the closing `::` in the mono face, `--accent`, letter-spacing `-.06em`.
- **Eyebrow** above it, as a SQL comment: `-- a maintained fork of Zapatos 6.6.1`, mono 500, 13px, `--accent`.
- **Favicon**: the `::` cut out of a rounded square in `--accent` (radius 3/16 of its side), so the tab shows through the four dots: `website/public/favicon.svg`, light and dark. The social card, 1200×630, sets the wordmark, eyebrow and hero line in the light theme: `website/public/social-card.svg`.
- **Accent**: one teal. Neutrals are greys biased toward it (blue-green), never pure grey.

## Colour tokens

Defined on `:root`. Three themes: **system** (the default: no attribute, `prefers-color-scheme` decides), **light** and **dark**, forced by `data-theme="light"` or `data-theme="dark"` on `<html>`. The dark values apply under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under `:root[data-theme="dark"]`, with `color-scheme: dark`. The theme button cycles system → light → dark and remembers the choice (`localStorage`, key `pgcast-theme`).

On the site, VitePress's own switch: the `.dark` class on `<html>` and the key `vitepress-theme-appearance` (`auto` · `light` · `dark`), because VitePress's pre-paint script reads only that key, and another one would flash the wrong theme on load. Same three themes, same values, system by default.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f8f9` | `#0d1318` | page background |
| `--surface` | `#ffffff` | `#121a21` | top bar, nav drawer, panels, tables, notes, pager |
| `--sunken` | `#eef2f4` | `#0a0f13` | inline code, table headers, search field, nav hover, plain chip |
| `--fg` | `#12202b` | `#e2e9ee` | text |
| `--muted` | `#566673` | `#8d9eab` | secondary text, labels, captions, hover-type underline |
| `--line` | `#d9e0e5` | `#23303a` | borders and rules |
| `--accent` | `#0a6b63` | `#4fcfbf` | links, `::`, current page, primary button, selected tab, focus ring |
| `--accent-fg` | `#ffffff` | `#06201d` | text on `--accent` |
| `--accent-soft` | `#dcefec` | `#11302c` | current nav item, chips, hover-type highlight, search selection |
| `--warn` | `#8a5a00` | `#e8b65a` | Security chip and its border, the banner's text |
| `--warn-soft` | `#fbf0d9` | `#2c2412` | Security note, the banner |
| `--code-bg` | `#f1f4f6` | `#0f171d` | code blocks, the install field |

Syntax tokens:

| Token | Light | Dark | Colours |
|---|---|---|---|
| `--k` | `#1458a8` | `#7fb6ff` | keywords (TS keywords; SQL keywords in capitals) |
| `--s` | `#8f5600` | `#e3b462` | strings |
| `--t` | `#0a6b63` | `#4fcfbf` | type names (the accent) |
| `--n` | `#b0245a` | `#f08ab3` | numbers |
| `--c` | `#7a8794` | `#6c7d8a` | comments, in italics |
| `--qi` | `#12202b` | `#e2e9ee` | SQL quoted identifiers (`"films"`), as plain text |
| `--p` | `#b0245a` | `#f08ab3` | SQL parameters (`$1`) and their values, in bold |

Other tokens: `--radius: 10px` (the cast panel 14px, buttons 9px, chips and the version pill `999px`); `--top: 56px`, the top bar's height.

## Type

| Face | Weights | Fallbacks | Used for |
|---|---|---|---|
| Schibsted Grotesk | 500, 700, 800 | `"Helvetica Neue", Arial, sans-serif` | headings (`h1`–`h3`): line-height 1.15, letter-spacing `-.01em`, `text-wrap: balance` |
| Inter | 400, 500, 600 | `system-ui, -apple-system, "Segoe UI", sans-serif` | body, 15px / 1.65 |
| JetBrains Mono | 400, 500, 700 | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | code, the wordmark, eyebrows, tabs, panel tags, tooltips |

| Element | Size |
|---|---|
| Hero `h1` | `clamp(2.3rem, 5.4vw, 4rem)`, 800, letter-spacing `-.025em`, at most 16ch |
| Hero lede | 1.18rem, at most 58ch |
| Page `h1` | 2.3rem, 800 (1.9rem under 560px) |
| `h2` / `h3` | 1.45rem / 1.1rem, 700 |
| Lede | 1.1rem, `--muted`, at most 62ch |
| Code blocks | 13px / 1.6, `tab-size: 2`; inline code `.88em` on `--sunken` with a border |
| Nav | 14px; group labels 11px, 600, capitals, letter-spacing `.08em`, `--muted` |
| "On this page", captions, edit row, footer | 13px |
| Hover-type tooltip | mono 12.5px / 1.5 |

## Layout

- **Top bar**, sticky, 56px, on `--surface` with a bottom rule: menu button (under 900px), wordmark, version pill, search (`⌘K` or `/`; on the site, the `⌘K` hint hidden under 1100px and the text under 900px), links Tutorial · Guides · Reference · Changelog · GitHub (`--muted`, 400, `--fg` on hover; the current group in `--fg` too; no external-link icon; hidden under 900px), theme button. Explanation is reached from the nav and the home: a fourth group link would push the theme button into VitePress's `⋯` menu at most widths from 768 to 1050px, with Changelog and GitHub at 960px (measured on a page with the left nav).
- **Shell**, at most 1360px: left nav 260px · reading column · "On this page" rail 220px. Gutters of 16px at least, and the safe-area insets.
- **Left nav**, sticky, in the four groups of Diátaxis (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § The site, which lists their pages): Tutorial · How-to guides · Reference · Explanation. The prototype's groups predate them.
  - Each group label links its landing page: the label, then two lines on what the group is for, then its pages.
  - A page that documents a minor carries its version as a small badge (Versions, opt-ins and warnings: 6.7).
  - The current page on `--accent-soft`, in `--accent`, 600.
- **Reading column**: the article at most 72ch, paragraphs and list items at most 68ch; padding 36px 48px 80px.
- **"On this page"** from 1200px: the page's `h2`s, the current one in `--accent` with an accent rule on its left.
- **Breakpoints**: under 1200px, nav 240px and no rail; under 900px, one column and the nav becomes a drawer, `min(300px, 86vw)`, sliding in from the left; under 560px, search as an icon, no version pill, the pager stacked. On the site, VitePress's own (768 / 960 / 1280px) for the shell, the top bar and the nav, rather than fighting its layout; the home grid, the notes, the page `h1` and the version pill keep 560 / 900px.
- **Home**: hero (eyebrow, line, lede, "Get started" as the primary button, "Switching from Zapatos", the install command with Copy), the cast panel of films with their cast, four pillars (Postgres is the source · SQL you can read · Values are parameters · Drop-in for Zapatos), four "read next" links, one per group (four columns, two under 900px, one under 560px).
- **Footer**, on the home page and under every page: "pgcast is maintained by Alexandre Demartin. Zapatos and its original documentation are by George MacKerron. MIT licence.", each name linking to their GitHub profile.

## Signature components

- **Cast panel**: three columns (`1.15fr 1.2fr .85fr`) in one bordered panel, radius 14px, dashed dividers. Each column has a header with a mono tag in an accent outline: `TS` You write · `SQL` Postgres runs · `::` TypeScript knows. The SQL column ends with its values row (`values ["cast"]`, dashed rule above). One column when the panel itself is under 900px wide (a container query), as in a page's reading column. An optional caption row under it, 13px, `--muted`.
- **Hover types**: a dashed `--muted` underline, `cursor: help`, `--accent-soft` on hover or focus; focusable from the keyboard. The tooltip: mono, `--surface`, border, soft shadow. On the site, Twoslash computes every type at build from the docs schema; the prototype's types are written by hand.
- **Code blocks**: on `--code-bg`, border, `--radius`; a 38px bar with a label or tabs (npm · pnpm · yarn, mono 12px, the selected one underlined in `--accent`) and a Copy button ("Copied" for 1.4s; it selects the text when the clipboard is refused).
- **Notes**: a chip, then the text, on `--surface` with a border, **no coloured side rail**. Chips: Opt-in (`--accent-soft`, `--accent`), Security (`--warn-soft`, `--warn`, a 1px `--warn` border, the note itself on `--warn-soft`), Coming (`--sunken`, `--muted`).
- **Options tables**: bordered, radius, header on `--sunken`; the columns read Option → SQL it adds → Effect on the type; codes such as `PGCAST_DEP001` in mono, tabular figures.
- **Pager**: two bordered links, Previous and Next, the border turning `--accent` on hover.
- **Edit row**: a top rule; "Edit this page on GitHub" on the left, "Checked against the docs schema at build · pgcast 6.7.0" (the version documented) on the right. On the site, the right holds "Last updated: 13 November 2026", the date of the page's last commit, 13px, `--muted`.
- **Search**: a dialog, 600px, arrows and Enter, Escape closes; each result gives its page.
- **Details**: `#` anchors on headings, shown on hover; links underlined 1px at 3px offset, 2px on hover; focus ring 2px `--accent`, offset 2px; `prefers-reduced-motion` honoured.

## Voice

- George MacKerron's: warm, brief, first person where natural; British spelling.
- pgcast's own world for every example (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § Decision, 7): a film's cast, in `website/schema.sql`: `studios`, `films`, `actors` and their `roles`, `crew`, `cinemas`, `screenings`, `seat_bookings`, `ratings`, `tags`; snake_case columns. Every title and name invented; never an extract from a real project. Zapatos's `authors` and `books` stay for the tests' fixture and existing JSDoc.

## What to avoid

The looks of generated sites, which the prototype avoids on purpose:

- purple or blue gradients, glows, gradient text, glossy blobs;
- emoji as markers or icons, "New ✨" badges, pulsing elements;
- cards everywhere: cards are kept for the pager and the "read next" links;
- coloured accent rails down the side of notes;
- decoration that carries no information.
