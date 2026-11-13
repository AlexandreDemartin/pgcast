// Copyright (C) 2026 Alexandre Demartin
// The playground's SQL and type, highlighted in the page as Shiki highlights a cast panel's at build (syntax.ts): the
// same markup and colour tokens, for the few kinds of token that compiled SQL and a hover type hold.

const
  escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  span = (text: string, colour = 'fg', bold = false) =>
    `<span style="color:var(--${colour})${bold ? ';font-weight:bold' : ''}">${escape(text)}</span>`,
  // each line with its indent, as `lineIndents` (syntax.ts) gives it: a line too long wraps under its own text
  block = (lang: string, text: string, highlight: (line: string) => string) =>
    `<div class="language-${lang}"><pre class="shiki pgcast" tabindex="0"><code>${text.split('\n').map(line => {
      const indent = /^ */.exec(line)![0].length;
      return `<span class="line"${indent ? ` style="--indent:${indent}ch"` : ''}>${highlight(line)}</span>`;
    }).join('\n')}</code></pre></div>`;

function colour(line: string, tokens: RegExp, colourOf: (match: RegExpExecArray) => [string, boolean?] | undefined) {
  let html = '', at = 0;
  for (const match of line.matchAll(tokens)) {
    const style = colourOf(match);
    if (!style) continue;
    html += (match.index > at ? span(line.slice(at, match.index)) : '') + span(match[0], ...style);
    at = match.index + match[0].length;
  }
  return html + (at < line.length ? span(line.slice(at)) : '');
}

/** pgcast's SQL: keywords in capitals, quoted identifiers as plain text, strings, numbers, and `$1` in bold. */
export const sqlHtml = (sql: string) => block('sql', sql, line => colour(line,
  /("(?:[^"]|"")*")|('(?:[^']|'')*')|(\$\d+)|\b([A-Z][A-Z_]*)\b|\b(\d+(?:\.\d+)?)\b/g,
  ([, identifier, string, parameter, keyword]) =>
    identifier ? ['qi'] : string ? ['s'] : parameter ? ['p', true] : keyword ? ['k'] : ['n']));

/**
 * A hover type, `const film: films.JSONSelectable | undefined`, and its `// that is` line: `const` and the type
 * operators as keywords, each name in the type as a type, a property's name and punctuation as plain text.
 */
export const typeHtml = (type: string) => block('ts', type, line => line.startsWith('//') ?
  span(line, 'c') :
  colour(line,
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b|\b(const|readonly|typeof|keyof|unique|infer)\b|\b[A-Za-z_$][\w$]*(?=\??:)|([A-Za-z_$][\w$]*)/g,
    ([, string, number, keyword, name]) =>
      string ? ['s'] : number ? ['n'] : keyword ? ['k'] : name ? ['t'] : undefined));
