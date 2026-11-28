// Copyright (C) 2026 Alexandre Demartin
// `node scripts/check-body.mjs [<file>]`: the owner's one-minute read (skill plan-and-proofs § Two layers). Counts the
// words of a PR body, an issue, a plan or a round comment above its first line that opens a `<details>`, and fails
// past the budget. Reads the file given, or else `PR_BODY` from the environment (.github/workflows/pr-body.yml).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const budget = 200;

// Whole lines left out: the line that links the issue, and the agent's attribution.
const leftOut = [/^\s*(?:Closes|Part of) #\d/i, /^\W*Generated with\b/];

/**
 * The words of `body` above its first line that opens a `<details>` (a `<details>` later in a line does not), HTML
 * comments, images and the lines of `leftOut` aside. A code span counts as one word, a link as its text, and a token
 * with no letter or digit (punctuation, a table's separator row) as none.
 */
export function wordsAboveFold(body) {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const fold = lines.findIndex(line => /^\s*<details\b/i.test(line));
  return lines.slice(0, fold === -1 ? lines.length : fold)
    .filter(line => !leftOut.some(pattern => pattern.test(line)))
    .map(line => line
      .replace(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, (_, text) => text)
      .replace(/`[^`\n]+`/g, ' code '))
    .flatMap(line => line.split(/\s+/))
    .filter(token => /[\p{L}\p{N}]/u.test(token))
    .length;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [file] = process.argv.slice(2), body = file ? readFileSync(file, 'utf8') : process.env.PR_BODY;
  if (body === undefined) {
    console.error('✗ no body: give a file, `node scripts/check-body.mjs <file>`, or set PR_BODY');
    process.exit(2);
  }
  const source = file ?? 'PR_BODY', words = wordsAboveFold(body);
  if (words > budget) {
    console.error(`✗ ${source}: ${words} words above the first <details>, over the budget of ${budget}; `
      + 'fold the detail below a <details> (skill plan-and-proofs § Two layers)');
    process.exit(1);
  }
  console.log(`✓ ${source}: ${words} words above the first <details>, budget ${budget}`);
}
