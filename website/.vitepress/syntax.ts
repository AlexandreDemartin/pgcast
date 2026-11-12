// Copyright (C) 2026 Alexandre Demartin
// The syntax colours of docs/design/art-direction.md as a Shiki theme: each colour is a token of theme/style.css,
// so one theme serves light and dark.

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
    colour(['string.quoted.double.sql'], 'var(--qi)'),
    colour(['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], 'var(--t)'),
    colour(['constant.numeric'], 'var(--n)'),
  ],
};
