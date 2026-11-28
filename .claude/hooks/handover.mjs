// Copyright (C) 2026 Alexandre Demartin
// PostToolUse hook of the `builder` (its frontmatter in `.claude/agents/builder.md`): counts the run's tool calls and,
// at the 80th, then every 20th, reminds it of its § Hand-over. Each call rereads the whole context, so a long run costs
// more with each call: from 2026-11-25 to 11-28, the builder runs past 80 calls made 67 % of builder cost (#812).
// It only reminds; the builder judges whether more than one point is left, and `maxTurns` is the hard stop.
import {appendFileSync, mkdirSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const handoverAt = Number(process.env.PGCAST_HANDOVER_AT) || 80;
const reminderEvery = 20;

/** The reminder due at the `count`th tool call of a run, or `undefined`. */
export function reminderAt(count) {
  if (count < handoverAt || (count - handoverAt) % reminderEvery !== 0) return undefined;
  return `Hand-over: this run has made ${count} tool calls (agent builder § Hand-over). With more than one point of the step `
    + 'left: at the next green commit, push, write `<scratch>/handoff.md` (points done, points left, the next command, '
    + 'the decisions taken and why), then stop and report it. With one point left, finish it.';
}

/** Adds one to the run's count, kept as the length of a file named after the run, and returns it. */
function countedCall(run) {
  const directory = join(tmpdir(), 'pgcast-handover');
  mkdirSync(directory, {recursive: true});
  const file = join(directory, run.replace(/[^\w-]/g, '_'));
  appendFileSync(file, '.'); // one byte per call: appends do not lose a count when parallel calls end together
  return statSync(file).size;
}

async function readStandardInput() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hookInput = JSON.parse(await readStandardInput());
  const run = hookInput.agent_id ?? hookInput.session_id;
  const reminder = run === undefined ? undefined : reminderAt(countedCall(run));
  if (reminder !== undefined) {
    process.stdout.write(JSON.stringify({hookSpecificOutput: {hookEventName: 'PostToolUse', additionalContext: reminder}}));
  }
}
