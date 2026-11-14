// Copyright (C) 2026 Alexandre Demartin
// Fenced code blocks as CommonMark reads them, for the checks that skip or read a page's code: `check-prose.mjs`,
// `check-reference.mjs`, `check-joined.mjs`, the fenced URLs of `anchors.ts`, and `llms.ts`, which writes the pages'
// Markdown for assistants. One rule for all five, so that none reads as prose what VitePress renders as code, nor the
// other way round.

/**
 * The start of a page whose ```` ```md ```` block holds a ```` ```ts ```` line, as a page that shows Markdown does:
 * that line closes no fence, so what a check appends to it is outside any block. Each check reads it before the pages.
 */
export const earlyCloser = '```md\n```ts\n```\n';

/**
 * The fence that `line` opens, its marker and its info string, or `undefined`. A ```` ``` ```` line with a backtick
 * after the marker opens none: it is inline code. Any indent, as in a list.
 */
export function fenceOpened(line: string) {
  const [, marker, info] = /^\s*(`{3,}|~{3,})(.*)$/.exec(line) ?? [];
  if (marker === undefined || (marker[0] === '`' && info!.includes('`'))) return undefined;
  return { marker, info: info!.trim() };
}

/** Whether `line` closes the fence that `marker` opened: the same character, at least as many, then only spaces. */
export function fenceClosed(marker: string, line: string) {
  const [, closer] = /^\s*(`{3,}|~{3,})\s*$/.exec(line) ?? [];
  return closer !== undefined && closer[0] === marker[0] && closer.length >= marker.length;
}
