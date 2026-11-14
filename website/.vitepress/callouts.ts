// Copyright (C) 2026 Alexandre Demartin
// A note's chip opens on its kind's icon (docs/design/art-direction.md § Signature components, Notes), written at build
// into VitePress's own markup, so the page runs no script for it; llms.ts reads the Markdown, so no icon reaches it.
import type { MarkdownRenderer } from 'vitepress';
import { svg } from './theme/icons.ts';

const kinds = ['tip', 'info', 'warning', 'danger'] as const;

/** Put the kind's icon first in each `::: tip`, `::: info`, `::: warning` and `::: danger` chip. */
export function calloutIcons(md: MarkdownRenderer) {
  for (const kind of kinds) {
    const rule = `container_${kind}_open`, render = md.renderer.rules[rule];
    if (!render) throw new Error(`callouts.ts: VitePress no longer renders \`::: ${kind}\` as ${rule}`);
    md.renderer.rules[rule] = (...args) =>
      render(...args).replace(/^(<div [^>]*><p class="custom-block-title[^"]*">)/, `$1${svg(kind)}`);
  }
}
