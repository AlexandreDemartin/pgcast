// Run by `npm run check:agents` (node:test, no dependency).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {handoverAt, reminderAt} from './handover.mjs';

test('reminds at the 80th call, then every 20th, never before', () => {
  assert.equal(handoverAt, 80);
  for (const count of [1, 79, 81, 99, 101]) assert.equal(reminderAt(count), undefined, String(count));
  for (const count of [80, 100, 120]) assert.match(reminderAt(count), new RegExp(`made ${count} tool calls`), String(count));
});

test('counts each run apart and answers with additional context', () => {
  const call = agent_id => spawnSync(process.execPath, ['.claude/hooks/handover.mjs'], {
    input: JSON.stringify({session_id: 's', agent_id, hook_event_name: 'PostToolUse', tool_name: 'Bash'}),
    env: {...process.env, PGCAST_HANDOVER_AT: '2'}, encoding: 'utf8',
  });
  const one = `test-${randomUUID()}`, two = `test-${randomUUID()}`;
  assert.equal(call(one).stdout, '');
  assert.equal(call(two).stdout, '');
  const output = JSON.parse(call(one).stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(output.hookSpecificOutput.additionalContext, /made 2 tool calls/);
});
