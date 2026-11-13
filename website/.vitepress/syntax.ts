// Copyright (C) 2026 Alexandre Demartin
// The syntax colours of docs/design/art-direction.md as a Shiki theme: each colour is a token of theme/style.css,
// so one theme serves light and dark.
import type { MarkdownOptions } from 'vitepress';

const colour = (scope: string[], foreground: string) => ({ scope, settings: { foreground } });  // no italics

export const syntax = {
  name: 'pgcast',
  type: 'light',
  fg: 'var(--fg)',
  bg: 'var(--code-bg)',
  settings: [
    colour(['comment', 'punctuation.definition.comment'], 'var(--c)'),
    colour(['keyword', 'storage', 'constant.language', 'variable.language', 'entity.name.command'], 'var(--k)'),
    colour(['keyword.operator', 'punctuation', 'string.unquoted.argument'], 'var(--fg)'),
    colour(['keyword.operator.new', 'keyword.operator.expression'], 'var(--k)'),
    colour(['string', 'punctuation.definition.string', 'support.type.property-name'], 'var(--s)'),
    colour(['string.quoted.double.sql', 'string.quoted.double.sql punctuation.definition.string'], 'var(--qi)'),
    colour(['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], 'var(--t)'),
    colour(['constant.numeric'], 'var(--n)'),
  ],
};

type Transformer = NonNullable<MarkdownOptions['codeTransformers']>[number];

/**
 * Each indented line's indent, as `--indent` in `ch`: the cast panel wraps a line too long for its column under the
 * line's own text, 2ch further in (theme/style.css).
 */
export const lineIndents: Transformer = {
  name: 'pgcast:line-indents',
  line(node, line) {
    const indent = /^ */.exec(this.tokens[line - 1]?.map(token => token.content).join('') ?? '')![0].length;
    if (indent) node.properties.style = `--indent:${indent}ch`;
  },
};

/**
 * A highlighted block's lines, each given what `mark(line)` returns (from 1): a class, a style. VitePress keeps one
 * Markdown renderer for the whole build, with the transformers of whoever created it first (`createMarkdownRenderer`):
 * a loader marks its own blocks on the HTML.
 */
export const markLines = (html: string, mark: (line: number) => { class?: string; style?: string }) => {
  let line = 0;
  return html.replace(/<span class="line"(?: style="([^"]*)")?>/g, (_, style?: string) => {
    const { class: extra, style: more } = mark(++line);
    return `<span class="${['line', extra].filter(Boolean).join(' ')}"` +
      (style || more ? ` style="${[style, more].filter(Boolean).join(';')}"` : '') + '>';
  });
};

/** `$1`, `$2`: Shiki's SQL grammar reads a `$`, then a number. Each becomes one token, in `--p` and bold. */
export const sqlParameters: Transformer = {
  name: 'pgcast:sql-parameters',
  tokens(lines) {
    if (this.options.lang !== 'sql') return;
    for (const line of lines) for (let i = line.length - 1; i > 0; i--) {
      const [before, digits] = [line[i - 1]!, line[i]!];
      if (!before.content.endsWith('$') || !/^\d+$/.test(digits.content)) continue;
      line[i] = { ...digits, content: '$' + digits.content, offset: digits.offset - 1, color: 'var(--p)', fontStyle: 2 };  // bold
      before.content = before.content.slice(0, -1);
      if (!before.content) line.splice(i - 1, 1);
    }
  },
};
