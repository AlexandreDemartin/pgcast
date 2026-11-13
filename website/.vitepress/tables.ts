// Copyright (C) 2026 Alexandre Demartin
// A table cell carries its column's header as `data-label`, so that a table in `<div class="stack">` can lay each row
// out as a block on a phone, each cell under its header (style.css; website/README.md § Easy reading).
import type { MarkdownRenderer } from 'vitepress';

/** Give each `<td>` the plain text of its column's `<th>`: `data-label="Zapatos 6.6.1"`. */
export function labelTableCells(md: MarkdownRenderer) {
  md.core.ruler.push('table_cell_labels', state => {
    let headers: string[] = [], column = 0;
    state.tokens.forEach((token, i) => {
      if (token.type === 'thead_open') headers = [];
      else if (token.type === 'tr_open') column = 0;
      else if (token.type === 'th_open') headers.push(state.tokens[i + 1]!.content.replace(/`/g, ''));
      else if (token.type === 'td_open' && headers[column]) token.attrSet('data-label', headers[column]!);
      if (token.type === 'th_open' || token.type === 'td_open') column++;
    });
  });
}
