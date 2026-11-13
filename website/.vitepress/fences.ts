// Copyright (C) 2026 Alexandre Demartin
// Fenced code blocks as CommonMark reads them, for the checks that skip or read a page's code: `check-prose.mjs`,
// `check-reference.mjs`, `check-joined.mjs` and the fenced URLs of `anchors.ts`. One rule for all four, so that a check
// never reads as prose what VitePress renders as code, nor the other way round.

/**
 * The start of a page whose ```` ```md ```` block holds a ```` ```ts ```` line, as a page that shows Markdown does: that
 * line closes no fence, so what a check appends to it is outside any block. Each check reads it before the pages.
 */
export const earlyCloser = '```md\n```ts\n```\n';
