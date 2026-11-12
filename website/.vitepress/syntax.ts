// Copyright (C) 2026 Alexandre Demartin
// The syntax colours of docs/design/art-direction.md as a Shiki theme: each colour is a token of theme/style.css,
// so one theme serves light and dark.
import type { MarkdownOptions } from 'vitepress';

const colour = (scope: string[], foreground: string, fontStyle?: string) =>
  ({ scope, settings: fontStyle ? { foreground, fontStyle } : { foreground } });

export const syntax = {
  name: 'pgcast',
  type: 'light',
  fg: 'var(--fg)',
  bg: 'var(--code-bg)',
  settings: [
    colour(['comment', 'punctuation.definition.comment'], 'var(--c)', 'italic'),
    colour(['keyword', 'storage', 'constant.language', 'variable.language', 'entity.name.command'], 'var(--k)'),
    colour(['keyword.operator', 'punctuation', 'string.unquoted.argument'], 'var(--fg)'),
    colour(['keyword.operator.new', 'keyword.operator.expression'], 'var(--k)'),
    colour(['string', 'punctuation.definition.string', 'support.type.property-name'], 'var(--s)'),
    colour(['string.quoted.double.sql', 'string.quoted.double.sql punctuation.definition.string'], 'var(--qi)'),
    colour(['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], 'var(--t)'),
    colour(['constant.numeric'], 'var(--n)'),
  ],
};

/** `$1`, `$2`: Shiki's SQL grammar reads a `$`, then a number. Each becomes one token, in `--p` and bold. */
export const sqlParameters: NonNullable<MarkdownOptions['codeTransformers']>[number] = {
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
