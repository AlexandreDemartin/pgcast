// Exercise the CLI used by both the CI dry run and the tag workflow.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const resolve = tag => spawnSync(process.execPath, ['scripts/release-folder.mjs', tag], {encoding: 'utf8'});

for (const [folder, prefix] of [
  ['.', 'v'],
  ['adapters/postgres-js', '@pgcast/adapter-postgres-js@'],
  ['adapters/pglite', '@pgcast/adapter-pglite@'],
]) {
  test(`resolves the release tag for ${folder}`, () => {
    const {version} = JSON.parse(readFileSync(`${folder}/package.json`, 'utf8'));
    const {status, stdout, stderr} = resolve(prefix + version);
    assert.equal(status, 0, stderr);
    assert.equal(stdout.trim(), folder);
  });
}

for (const tag of ['v0.0.0-unknown', '@pgcast/adapter-pglite@0.0.0-unknown', '@pgcast/unknown@1.0.0']) {
  test(`rejects unmatched tag ${tag}`, () => {
    const {status, stdout, stderr} = resolve(tag);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr.trim(), `No package matches tag ${tag}`);
  });
}
