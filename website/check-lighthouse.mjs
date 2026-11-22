// Copyright (C) 2026 Alexandre Demartin
// Runs Lighthouse on four pages of the built site served by `npm run docs:preview` (the home, a reference page, a guide
// and an explanation), prints their four scores and fails under 95 in any of them. Lighthouse comes through `npx` at an
// exact version, never as a dependency. Run by the `docs` job of ci.yml, after `docs:build`:
//   npm run docs:preview -- --port 4173 &  node check-lighthouse.mjs http://localhost:4173
// Chrome comes from CHROME_PATH, or is found by Lighthouse; a runner needs --no-sandbox, `CHROME_FLAGS` adds it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const
  lighthouse = 'lighthouse@13.6.0',
  threshold = 95,
  pages = ['/', '/select', '/first-query', '/why'],
  categories = ['performance', 'accessibility', 'best-practices', 'seo'],
  base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, ''),
  // the desktop preset: it is how the pages are read (the docs are written at a desk); the mobile one throttles the CPU by 4
  // and the network to slow 4G, which on a shared runner moves the performance score by more than the threshold's margin
  flags = ['--preset=desktop', '--quiet', '--output=json', ...categories.map(category => `--only-categories=${category}`),
    `--chrome-flags=--headless=new ${process.env.CHROME_FLAGS ?? ''}`],
  folder = mkdtempSync(join(tmpdir(), 'pgcast-lighthouse-')),
  rows = [],
  failures = [];

for (const [index, page] of pages.entries()) {
  const output = join(folder, `${index}.json`);
  execFileSync('npx', ['--yes', lighthouse, base + page, ...flags, `--output-path=${output}`], { stdio: ['ignore', 'inherit', 'inherit'] });
  const { categories: results, audits } = JSON.parse(readFileSync(output, 'utf8'));
  const scores = categories.map(category => Math.round(results[category].score * 100));
  const lab = ['largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift'].map(id => audits[id].displayValue);
  rows.push(`${page.padEnd(14)} ${scores.map(score => String(score).padStart(5)).join('  ')}   LCP ${lab[0]}, TBT ${lab[1]}, CLS ${lab[2]}`);
  categories.forEach((category, i) => {
    if (scores[i] >= threshold) return;
    const failed = results[category].auditRefs.filter(({ id }) => audits[id].score !== null && audits[id].score < 1 && audits[id].scoreDisplayMode !== 'informative')
      .map(({ id }) => id);
    failures.push(`${page} ${category} ${scores[i]} < ${threshold}: ${failed.join(', ')}`);
  });
}

console.log(`\n${'page'.padEnd(14)} ${['perf', 'a11y', 'best', 'seo'].map(name => name.padStart(5)).join('  ')}   (${lighthouse}, desktop)`);
console.log(rows.join('\n'));
if (failures.length > 0) {
  console.error(`\nThe Lighthouse check failed:\n  ${failures.join('\n  ')}`);
  process.exitCode = 1;
}
