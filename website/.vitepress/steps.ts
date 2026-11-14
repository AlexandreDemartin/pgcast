// Copyright (C) 2026 Alexandre Demartin
// A step of a page read in order (`## 1. Set up the project`) shows its number in a small round marker, so that the
// steps read at a glance (style.css, art direction § Signature components). The heading's text is unchanged: its
// anchor, its line in "On this page" and in the search still read "1. Set up the project".
import type { MarkdownRenderer } from 'vitepress';

/** Wrap the number of an `h2` that starts `<n>. `: `<span class="step">1<span class="visually-hidden">.</span></span>`. */
export function markSteps(md: MarkdownRenderer) {
  md.core.ruler.push('step_numbers', state => {
    state.tokens.forEach((token, i) => {
      const inline = state.tokens[i + 1], first = inline?.children?.[0];
      if (token.type !== 'heading_open' || token.tag !== 'h2' || first?.type !== 'text') return;
      const step = /^(\d+)\.\s+/.exec(first.content);
      if (!step) return;
      const piece = (type: 'text' | 'html_inline', content: string) =>
        Object.assign(new state.Token(type, '', 0), { content });
      first.content = ` ${first.content.slice(step[0].length)}`;
      inline!.children!.unshift(
        piece('html_inline', '<span class="step">'), piece('text', step[1]!),
        piece('html_inline', '<span class="visually-hidden">'), piece('text', '.'), piece('html_inline', '</span></span>'),
      );
    });
  });
}
