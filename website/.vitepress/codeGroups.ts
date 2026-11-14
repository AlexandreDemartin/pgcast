// Copyright (C) 2026 Alexandre Demartin
// A code group's tab named after a package manager opens on its mark (icons.ts), as the home's install block does:
// written at build into VitePress's own markup, so the page runs no script for it and nothing moves once it loads. The
// mark is hidden from assistive technology: the tab's name stays the manager's.
import type { MarkdownRenderer } from 'vitepress';
import { svg } from './theme/icons.ts';

const managers = ['npm', 'pnpm', 'yarn', 'bun'] as const;

/** Put each package manager's mark first in its `::: code-group` tab: `<label data-title="pnpm" …>`. */
export function codeGroupLogos(md: MarkdownRenderer) {
  const rule = 'container_code-group_open', render = md.renderer.rules[rule];
  if (!render) throw new Error(`codeGroups.ts: VitePress no longer renders \`::: code-group\` as ${rule}`);
  md.renderer.rules[rule] = (...args) =>
    render(...args).replace(/(<label data-title="([^"]*)"[^>]*>)/g, (label, open: string, title: string) =>
      (managers as readonly string[]).includes(title) ? open + svg(title as typeof managers[number]) : label);
}
