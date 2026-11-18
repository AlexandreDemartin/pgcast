// Run by `npm run check:agents` (node:test, no dependency).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {refusalOf} from './guard.mjs';

const bash = command => refusalOf({tool_name: 'Bash', tool_input: {command}});
const write = file_path => refusalOf({tool_name: 'Write', tool_input: {file_path}});

test('refuses force-push, rebase, amend, --no-edit and a merge with no message, even after another command', () => {
  for (const command of [
    'git push --force',
    'git push -f origin x',
    'git push origin +x',
    'git push --force-with-lease',
    'cd src && git rebase master',
    'git pull --rebase',
    'git commit --amend -m x',
    'git commit --no-edit',
    'git merge --no-edit origin/master',
    'cd x && git -C y merge origin/master --no-edit',
    'git merge origin/master',
    'git -C y merge origin/x',
    'git -c core.editor=true merge origin/master',
  ]) {
    assert.ok(bash(command), command);
  }
});

test('refuses publishing', () => {
  for (const command of ['npm publish', 'npm version patch', 'npx npm@11 publish', 'gh release create v1']) {
    assert.ok(bash(command), command);
  }
});

test('refuses pushing a tag, which starts release.yml', () => {
  for (const command of [
    'git push origin v6.11.0',
    'git push origin refs/tags/v6.11.0',
    'git push origin tag v6.11.0',
    'git push --tags',
    'git push --follow-tags origin master',
    'git push origin +v6.11.0',
    'git -C x push origin v7.0.0',
    'cd x && git push origin v6.11.0',
  ]) {
    assert.ok(bash(command), command);
  }
  for (const command of ['git push origin docs/19-method', 'git push -u origin fix/12-v2-names', 'git tag -l "v*"']) {
    assert.equal(bash(command), undefined, command);
  }
});

test('refuses a PR that does not name the fork', () => {
  assert.ok(bash('gh pr create --draft --base master --title x'));
  assert.ok(bash('gh pr create --repo jawj/zapatos --base master'));
  assert.equal(bash('gh pr create --draft --repo AlexandreDemartin/pgcast --base master --title x'), undefined);
});

test('lets ordinary commands run, and ignores mentions inside quotes and heredocs', () => {
  for (const command of [
    'git push',
    'git push -u origin chore/x',
    'npm ci',
    'npm run build',
    'npm test',
    'git commit -m "never git push --force nor npm publish"',
    'cat > x.md <<\'EOF\'\ngit rebase\nnpm publish\nEOF',
    'git merge -m "Merge master into x" -m "Co-Authored-By: x" origin/master',
    'git merge origin/master -m "Merge master into $br" -m "$CO" >/dev/null 2>&1',
    'git merge --abort',
    'git merge --continue',
    'git merge --ff-only origin/master',
    'git merge --no-commit origin/master',
    'git merge-base --is-ancestor origin/master HEAD',
    'git commit -m "say why --no-edit is refused"',
    'git commit -q -m "Merge master into x" -m "Co-Authored-By: x"',
    'git pull --ff-only',
    'gh pr merge 509 --repo AlexandreDemartin/pgcast --squash --subject "x (closes #18)" --body "y"',
  ]) {
    assert.equal(bash(command), undefined, command);
  }
});

test('refuses writing build output and .env files', () => {
  for (const path of ['/r/dist/db/core.js', '/r/db.mjs', '/r/generate.mjs', '/r/src/.env', '/r/.env.local']) {
    assert.ok(write(path), path);
  }
  for (const path of ['/r/src/db/core.ts', '/r/db.js', '/r/docs/env.md', '/r/test/fixtures/schema.sql']) {
    assert.equal(write(path), undefined, path);
  }
});
