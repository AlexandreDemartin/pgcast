# Accessibility checks of the documentation site

WCAG 2.2 AA on the theme, the cast panel and the nav, checked by hand on `npm run docs:preview` with the chrome-devtools tools (a snapshot, Tab through the page, computed sizes and styles), in the light and the dark theme. The automated check is `website/check-lighthouse.mjs`, run by the `docs` job of `ci.yml`: four pages (`/`, `/select`, `/first-query`, `/why`), desktop preset, at least 95 in each of the four categories. Part of #195, issue #861.

## Manual checks, 2026-11-22

| Criterion | Result |
|---|---|
| 2.4.7 Focus visible | **Pass.** Every control shows a 2px `--accent` ring, offset 2px (`:focus-visible`, `style.css`): nav links, search, theme switch, sidebar links and carets, "On this page", copy buttons, header anchors, the cast panel's "Open in playground", code blocks, tables, checkboxes, footer links. Light `#0a6b63`, dark `#4fcfbf`. |
| 2.4.11 Focus not obscured | **Pass.** The fixed top bar is 52px. A link focused from far away is centred (top at 80px or more), never under the bar. |
| 1.4.11 Non-text contrast, focus | **Fixed.** A Twoslash term (`tabindex="0"`) showed focus by its background alone, `--accent-soft` on `--code-bg`: 1.08:1 light, 1.28:1 dark. It now also has the 2px `--accent` ring (6.4:1 and 9.2:1 on `--surface`). |
| 2.5.8 Target size | **Pass, by spacing and exceptions.** Inline links in a sentence are exempt. Three targets are under 24px and not inline, none has another target within a 24px circle around its centre: the heading permalink (16.7 × 31.6), the task checkbox (13 × 13, its label is 114 × 39 and toggles it) and the cast panel's "Open in playground" (116 × 12). The skip link is shown, larger, on focus. Kept at 12px high: it is a quiet label by design (`art-direction.md`), and spacing satisfies the criterion. |
| 1.4.3 Text contrast | **Pass.** Body `--fg` on `--bg` 15.6:1 light, 15.2:1 dark. `--muted` on `--bg`, `--surface` and `--sunken`: 5.3 to 5.9 light, 6.4 to 7.0 dark. `--accent` on `--bg`, `--surface`, `--code-bg`, `--accent-soft`: 5.3 to 6.4 light, 7.4 to 9.8 dark. Button text 6.4 and 8.9. Warning text on its tint 5.2 and 8.2; error text on code 5.7 and 5.5. Ratios from the token table of `art-direction.md`. |

Not covered by hand: the playground page's Monaco editor and the pages in French (same theme and components).

## Lab figures

Lighthouse 13.6.0, desktop preset, local `docs:preview`, 2026-11-22.

| Page | Performance | Accessibility | Best Practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 | 0.6 s | 0 ms | 0 |
| `/select` | 100 | 100 | 100 | 100 | 0.4 s | 0 ms | 0.002 |
| `/first-query` | 100 | 100 | 100 | 100 | 0.2 s | 0 ms | 0.002 |
| `/why` | 100 | 100 | 100 | 100 | 0.2 s | 0 ms | 0.001 |

On the CI runner (run 44969323753, same preset) `/select` scores 93 in Performance (TBT 220 ms; LCP 0.3 s, CLS 0.002), the other three 100. A 4x CPU slowdown on a laptop reproduces it (82, TBT 420 ms). Cause: hydrating the page, a 439 kB document with 278 Twoslash popovers (`v-popper`) and 54 cast panels, in `theme.js` and `framework.js` long tasks. Not fixed here (no small, clear fix in the theme): it is open on #861.

The mobile preset gives 96 in Performance on `/select` (LCP 1.8 s, TBT 190 ms): too close to the threshold on a shared runner, hence desktop in CI.

## Field data

None recorded. The site is new and its visits are likely too few for the Chrome UX Report, which publishes an origin's LCP, INP and CLS at the 75th percentile only above a traffic floor (not queried: it needs an API key). Revisit when PageSpeed Insights shows field data for `pgcast.dev`. INP has no lab figure: Lighthouse measures TBT instead.
