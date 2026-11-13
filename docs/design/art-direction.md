# Art direction of the documentation site

The look of pgcast's docs ([decision 004](../decisions/004-documentation-site.md)). The source of truth is the live site, <https://pgcast.dev>, and its theme, `website/.vitepress/theme/`; this page describes them. A change to the look changes this page first. The first prototype, approved by the owner in 2026-11, is in git's history (`docs/design/prototype.html`, removed 2026-11-13, #297).

## Identity

- **Wordmark**: `pg::cast`, in the mono face, 700, 19px, letter-spacing `-.02em`; the `::` (Postgres's cast operator) in `--accent`, with 1px either side.
- **Hero line**: "Your types, cast from your database::", the display face at 600; the closing `::` in the mono face, 700, `--accent`, letter-spacing `-.06em`.
- **Eyebrow** above it, as a SQL comment: `-- a maintained fork of Zapatos 6.6.1`, mono 500, 13px, `--accent`.
- **Favicon**: the `::` cut out of a rounded square in `--accent` (radius 3/16 of its side), so the tab shows through the four dots: `website/public/favicon.svg`, light and dark. The social card, 1200×630, sets the wordmark, eyebrow and hero line in the light theme: `website/public/social-card.svg`.
- **Accent**: one teal. Neutrals are greys biased toward it (blue-green), never pure grey.

## Colour tokens

Defined on `:root`, the dark values on `.dark` with `color-scheme: dark`. Three themes, VitePress's switch: **system** (the default), **light** and **dark**; the `.dark` class on `<html>` and the key `vitepress-theme-appearance` (`auto` · `light` · `dark`), because VitePress's pre-paint script reads only that key, and another one would flash the wrong theme on load. The theme button cycles system → light → dark.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f6f8f9` | `#0d1318` | page background |
| `--surface` | `#ffffff` | `#121a21` | top bar, nav drawer, panels, tables, notes, pager |
| `--sunken` | `#eef2f4` | `#0a0f13` | inline code, table headers, search field, nav hover, plain chip, copy button hover |
| `--fg` | `#12202b` | `#e2e9ee` | text |
| `--muted` | `#566673` | `#8d9eab` | secondary text, labels, captions, hover-type underline |
| `--line` | `#d9e0e5` | `#23303a` | borders and rules |
| `--accent` | `#0a6b63` | `#4fcfbf` | links, `::`, current page, primary button, selected tab, focus ring |
| `--accent-fg` | `#ffffff` | `#06201d` | text on `--accent` |
| `--accent-soft` | `#dcefec` | `#11302c` | current nav item, chips, hover-type highlight, search selection |
| `--warn` | `#8a5a00` | `#e8b65a` | Security chip and its border, the banner's text |
| `--warn-soft` | `#fbf0d9` | `#2c2412` | Security note, the banner |
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
| Nav | pages 14px, `--muted` (`--fg` on hover, the current one `--accent`); group labels in the headings' face, 15px, 600, `--fg`, on a `--sunken` band from the nav's left edge to its right, with a `--line` rule above and below, sentence case, no letter-spacing, 32px under the group above |
| "On this page" | its title 13px, 600, `--muted`, sentence case; its links 13px |
| Captions, edit row, footer | 13px |
| Hover-type tooltip | mono 12.5px / 1.5 |

No capitals for labels, no italics: comments included.

## Layout

Spacing is on a 4px grid.

- **Top bar**, sticky, 56px, on `--surface` with a bottom rule across the whole width (under 960px, VitePress's Menu bar under it opens the nav; under 768px, its menu button holds the links): wordmark, version pill, search (`⌘K` or `/`: the button reads "Search", its label "Search the docs"; the `⌘K` hint hidden under 1100px and the text under 900px), links Tutorial · Guides · Reference · Playground · GitHub (`--muted`, 400, `--fg` on hover; the current group in `--fg` too; no external-link icon; 11px either side, so that Playground fits at 960px; hidden under 768px), theme button. Explanation is reached from the nav and the home: a fourth group link would push the theme button into VitePress's `⋯` menu at most widths from 768 to 1050px, with Playground and GitHub at 960px (measured on a page with the left nav). The changelog is linked from the footer.
- **Shell**, VitePress's, at most 1440px: left nav 260px · reading column, at most 688px · "On this page" rail, at most 256px, from 1280px. Gutters of 16px at least, and the safe-area insets.
- **Left nav**, sticky, in the four groups of Diátaxis (amended 2026-11-12, [decision 004](../decisions/004-documentation-site.md) § The site, which lists their pages): Tutorial · How-to guides · Reference · Explanation.
  - Rows of 32px (padding `6px 12px`, 14px / 20px), 4px apart, radius 8px; `--sunken` on hover.
  - Each group's label links its landing page: a row of 36px, its text in line with its pages' text; 32px under the group above, 12px over its pages.
  - A page that documents a minor carries its version as a small badge (Versions, opt-ins and warnings: 6.7).
  - The current page on `--accent-soft`, in `--accent`, 600.
- **Reading column**: paragraphs and list items at most 68ch; VitePress's padding (48px 32px from 960px).
- **"On this page"**: the page's `h2`s, the current one in `--accent` with an accent rule on its left.
- **Group landing pages** (`/tutorial`, `/guides`, `/reference`, `/explanation`): the title, the lede on what the group is for, then each page: its title, a link as every other in the docs (16px, 500, `--accent`, underlined 1px at 3px, 2px on hover), then its line, 4px under it, in `--muted`: the page's description, its lede cut as `meta.ts` cuts it (`groups.data.ts`). 20px between pages, 32px under the lede.
- **Breakpoints**: VitePress's (768 / 960 / 1280px) for the shell, the top bar and the nav, rather than fighting its layout: under 960px the nav becomes a drawer. The home grid, the notes, the page `h1` and the version pill keep 560 / 900px; the cast panel follows its own width (§ Signature components).
- **Home**, on a 1180px column:
  - The hero: eyebrow, line, lede, then two buttons, "Get started" (primary) and "Switching from Zapatos", 40px tall, padding `0 20px`; under them, 16px down, the install command as one quiet mono line, 13px: a `--muted` `$`, the command in `--fg`, and a copy icon button, 28px, no border (16px icon, 2px stroke on a 24px grid, as the theme button's).
  - Then the cast panel of films with their cast; four pillars (Postgres is the source · SQL you can read · Values are parameters · Drop-in for Zapatos), each an `h2` at 1rem, 600; four "read next" links, one per group (four columns, two under 900px, one under 560px).
  - Rhythm: 72px over the eyebrow (48px under 560px); eyebrow 16px, line 20px, lede 28px over the buttons; 48px from the hero to the cast panel (32px under 560px); 56px between the sections under it; the pillars under a rule, 32px under it, 32px apart.
- **Footer**, on the home page and under every page: "pgcast is maintained by Alexandre Demartin. Zapatos and its original documentation are by George MacKerron. MIT licence. What changed in each version: the changelog.", each name linking to their GitHub profile, "changelog" to `/changelog`.

## Signature components

- **Cast panel**: what you write, what Postgres runs, what TypeScript knows, in one bordered panel, radius 14px, dashed dividers. Each column has a label (a paragraph, so no heading level is skipped) with a mono tag in an accent outline: `TS` You write · `SQL` Postgres runs · `::` TypeScript knows. The SQL column ends with its values row (`values ["cast"]`, dashed rule above). An optional caption row under it, 13px, `--muted`.
  - Its columns follow the panel's own width (container queries): three (`1.15fr 1fr 1fr`) from 1140px, the home's at 1280px and up, where what you write and the type fit their columns; from 900 to 1139px, what you write and the SQL side by side, the type below across both; one column under 900px, as in a page's reading column.
  - No line is cut: a line too long for its column wraps, and goes on under the line's own text, 2ch further in (a hanging indent, from each line's `--indent`, `lineIndents` in `syntax.ts`); a name longer than the column breaks anywhere. No three columns hold every line of the home's example at 1440px (the SQL wraps), nor one column the longest SQL of the reference, so wrapping, not scrolling, is the rule.
- **Playground** (`/playground`, [decision 005](../decisions/005-playground.md)): a cast panel whose first column is an editor, Monaco, in the site's colours: its theme is built from the tokens above (`--k --s --t --n --c --fg`, `--surface` behind the code, `--accent` cursor, `--accent-soft` selection, brackets as punctuation), light or dark with the page; no line numbers, guides or minimap, as a code block, and a long line wraps 2ch further in, as in the cast panel. The SQL and the type update as you type, highlighted as Shiki highlights them at build. Hovers and suggestions take the tooltip's look. On a phone, the panel is static, read-only, with a line saying the playground edits code on a computer.
- **Hover types**: a dashed `--muted` underline, `cursor: help`, `--accent-soft` on hover or focus; focusable from the keyboard. The tooltip: mono, `--surface`, border, soft shadow. Twoslash computes every type at build from the docs schema.
- **Code blocks**: on `--code-bg`, border, `--radius`; a code group has a 38px bar of tabs (npm · pnpm · yarn, mono 12px, the selected one underlined in `--accent`); VitePress's Copy button. The install line's copy button: "Copied" beside it for 1.4s; it selects the command when the clipboard is refused.
- **Notes**: a chip, then the text, on `--surface` with a border, **no coloured side rail**. Chips: Opt-in (`--accent-soft`, `--accent`), Security (`--warn-soft`, `--warn`, a 1px `--warn` border, the note itself on `--warn-soft`), Coming (`--sunken`, `--muted`).
- **Options tables**: bordered, radius, header on `--sunken`; the columns read Option → SQL it adds → Effect on the type; codes such as `PGCAST_DEP001` in mono, tabular figures.
- **Pager**: two bordered links, Previous and Next, the border turning `--accent` on hover.
- **Edit row**: a top rule; "Edit this page on GitHub" on the left; on the right "Last updated: 13 November 2026", the date of the page's last commit, 13px, `--muted`.
- **Search**: VitePress's local search, a dialog; arrows and Enter, Escape closes; each result gives its page.
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
