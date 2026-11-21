// Copyright (C) 2026 Alexandre Demartin

import { writeSync } from 'node:fs';

// Imported first by cli.ts: a package manager that skipped peers (--legacy-peer-deps) would otherwise end in a raw stack.
for (const peer of ['@pgcast/pgcast/generate', 'pg']) {
  try { require.resolve(peer); } catch {
    const name = peer.replace('/generate', '');
    writeSync(2, `${name} is not installed: @pgcast/typegen needs it as a peer dependency. Install it with npm install ${name}\n`);
    process.exit(1);
  }
}
