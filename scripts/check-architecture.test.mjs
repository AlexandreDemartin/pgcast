// Run by `npm run check:agents` (node:test, no dependency): checkArchitecture() on near misses planted in a small map.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkArchitecture} from './check-architecture.mjs';

const agents = `# AGENTS.md

## Architecture

- \`src/generate/\`: the codegen.
  - \`cli.ts\` runs the CLI; \`config.ts\` holds the config.
- \`src/db/\`: the runtime.
  - \`core.ts\`: \`sql\`; \`config.ts\`.

\`notes.ts\` is outside the directory bullets.

## Commands
`;
const modules = {'src/generate/': ['cli.ts', 'config.ts', 'index.ts'], 'src/db/': ['core.ts', 'config.ts', 'index.ts']};

test('passes when each module is named, index.ts aside', () => {
  assert.deepEqual(checkArchitecture(agents, modules), []);
});

test('fails on a module left out, per directory', () => {
  assert.deepEqual(checkArchitecture(agents, {...modules, 'src/db/': [...modules['src/db/'], 'pool.ts']}),
    ['AGENTS.md § Architecture: src/db/pool.ts is not named']);
  assert.deepEqual(checkArchitecture(agents.replace('`cli.ts` runs the CLI; ', ''), modules),
    ['AGENTS.md § Architecture: src/generate/cli.ts is not named']);
});

test('fails on a name whose file is gone, and reads no name outside the bullets', () => {
  assert.deepEqual(checkArchitecture(agents, {...modules, 'src/generate/': ['config.ts', 'cliConfig.ts']}), [
    'AGENTS.md § Architecture: src/generate/cliConfig.ts is not named',
    'AGENTS.md § Architecture: names src/generate/cli.ts, which does not exist',
  ]);
});

test('fails without the section', () => {
  assert.deepEqual(checkArchitecture('# AGENTS.md\n\n## Architectures\n', modules), ['AGENTS.md: no § Architecture']);
});
