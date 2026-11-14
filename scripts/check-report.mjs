// Copyright (C) 2026 Alexandre Demartin
// Recounts the summary of docs/CHARACTERISATION-REPORT.md from its sections, for `npm run check:agents`.
// A module of its own, which reads no file, so that scripts/check-report.test.mjs can plant near misses in it.

// The first word of a Proposal cell: bold once done, plain while it is only the class chosen.
const classOfProposal = {
  '**fixed**': 'fix', 'fix': 'fix',
  '**opt-in**': 'opt-in', 'opt-in': 'opt-in',
  '**documented**': 'document', 'document': 'document',
  'leave': 'leave',
};
const compats = ['breaking', 'non-breaking'];
const sentence =
  /^(\d+) findings to fix(?: \([^)]*\))?(, all fixed)?, (\d+) behind an opt-in, (\d+) to document and (\d+) to leave\.$/;

const cellsOf = line => line.split('|').slice(1, -1).map(cell => cell.trim());
const firstWordOf = cell => cell.split(/\s/)[0].replace(/[,:;.]$/, '');

/** Every way the summary (its table and its sentence) differs from what the sections count; empty if none. */
export function checkReport(text, path = 'docs/CHARACTERISATION-REPORT.md') {
  const
    errors = [],
    sections = [],  // in the order of the report: {name, findings, breaking, nonBreaking}
    classes = {'fix': 0, 'opt-in': 0, 'document': 0, 'leave': 0},
    numbers = new Set(),
    summaryRows = [],
    summaryLines = [];
  let heading, columns, pendingFixes = 0;

  for (const [index, line] of text.split('\n').entries()) {
    const where = `${path}:${index + 1}`;
    if (line.startsWith('## ')) {
      heading = line.slice(3).trim();
      columns = undefined;
      continue;
    }
    if (heading === 'Summary') {
      if (line.startsWith('|') && !/^\|[-| ]+\|$/.test(line)) summaryRows.push({where, cells: cellsOf(line)});
      else if (/\d+ (findings? to fix|behind an opt-in|to document|to leave)\b/i.test(line)) summaryLines.push({where, line});
      continue;
    }
    if (/^\|\s*#\s*\|/.test(line)) {
      const cells = cellsOf(line);
      columns = {count: cells.length, compat: cells.indexOf('Compat'), proposal: cells.indexOf('Proposal')};
      if (columns.compat < 0 || columns.proposal < 0) errors.push(`${where}: a findings table without a Compat or a Proposal column`);
      sections.push({name: heading, findings: 0, breaking: 0, nonBreaking: 0});
      continue;
    }
    // A loose detector beside the strict row: anything that looks like a finding and cannot be read fails.
    if (!/^\s*\|?\s*\**\s*R\d/i.test(line)) continue;
    const
      cells = cellsOf(line),
      number = /^R(\d+)$/.exec(cells[0] ?? '')?.[1];
    if (!line.startsWith('| ') || number === undefined || !columns || cells.length !== columns.count) {
      errors.push(`${where}: a finding row that cannot be read: \`| Rn | …\`, one cell per column, under a table's header`);
      continue;
    }
    if (numbers.has(number)) errors.push(`${where}: R${number} appears twice`);
    numbers.add(number);
    const
      section = sections[sections.length - 1],
      compat = firstWordOf(cells[columns.compat].replace(/\*\*/g, '')),
      proposal = firstWordOf(cells[columns.proposal]),
      klass = classOfProposal[proposal];
    section.findings++;
    if (compat === 'breaking') section.breaking++;
    else if (compat === 'non-breaking') section.nonBreaking++;
    else errors.push(`${where}: R${number}'s Compat starts with '${compat}', not ${compats.join(' nor ')}`);
    if (klass) classes[klass]++;
    else errors.push(`${where}: R${number}'s Proposal starts with '${proposal}', not one of ${Object.keys(classOfProposal).join(', ')}`);
    if (proposal === 'fix') pendingFixes++;
  }

  // The table: one row per section, in order, then the total.
  const
    total = sections.reduce((sum, s) => ({
      name: 'Total', findings: sum.findings + s.findings, breaking: sum.breaking + s.breaking,
      nonBreaking: sum.nonBreaking + s.nonBreaking,
    }), {name: 'Total', findings: 0, breaking: 0, nonBreaking: 0}),
    expected = [...sections, total],
    [header, ...rows] = summaryRows;
  if (header?.cells.join('|') !== 'Severity|Findings|Breaking|Non-breaking') {
    errors.push(`${path}: § Summary has no table headed | Severity | Findings | Breaking | Non-breaking |`);
  }
  for (let i = 0; i < Math.max(rows.length, expected.length); i++) {
    const
      row = rows[i],
      want = expected[i],
      wantCells = want && [want.name, want.findings, want.breaking, want.nonBreaking].map(String),
      cells = row?.cells.map(cell => want?.name === 'Total' ? cell.replace(/^\*\*(.*)\*\*$/, '$1') : cell);
    if (!row) errors.push(`${path}: § Summary lacks the row | ${wantCells.join(' | ')} |`);
    else if (!want) errors.push(`${row.where}: no section counts this row: ${row.cells.join(' | ')}`);
    else if (cells.join('|') !== wantCells.join('|')) {
      const shown = want.name === 'Total' ? wantCells.map(cell => `**${cell}**`) : wantCells;
      errors.push(`${row.where}: the row reads | ${row.cells.join(' | ')} |, the sections count | ${shown.join(' | ')} |`);
    }
  }

  // The sentence: "N findings to fix (…), all fixed, M behind an opt-in, P to document and Q to leave."
  const matches = summaryLines.map(({where, line}) => ({where, line, match: sentence.exec(line)}));
  for (const {where, line, match} of matches) {
    if (!match) errors.push(`${where}: a count that cannot be read, not in the form of ${sentence}: ${line}`);
  }
  const read = matches.filter(m => m.match);
  if (read.length !== 1) errors.push(`${path}: § Summary needs one sentence of counts, found ${read.length}`);
  else {
    const
      {where, match: [, fix, allFixed, optIn, document, leave]} = read[0],
      said = {'fix': fix, 'opt-in': optIn, 'document': document, 'leave': leave};
    for (const [klass, count] of Object.entries(classes)) {
      if (Number(said[klass]) !== count) {
        errors.push(`${where}: the sentence counts ${said[klass]} '${klass}', the Proposal cells ${count}`);
      }
    }
    if (allFixed && pendingFixes > 0) errors.push(`${where}: "all fixed", yet ${pendingFixes} Proposal cells still read 'fix'`);
  }
  return errors;
}
