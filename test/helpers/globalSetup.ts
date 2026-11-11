// Copyright (C) 2026 Alexandre Demartin
//
// Vitest global setup: once per run, drops the pgcast_test_* databases left by
// dead runs, builds the template database from test/fixtures/schema.sql, and
// hands its name to the test files (inject('pgcastDb'), see db.ts).
// Without TEST_DATABASE_URL it does nothing: unit tests still run, integration
// tests fail with missingUrlMessage.

import { readFileSync } from 'node:fs';
import type { TestProject } from 'vitest/node';
import {
  createDatabase, dropDatabase, isProcessAlive, listTestDatabases, orphanDatabases,
  runPrefix, testDatabaseUrl, urlForDatabase, withAdminClient,
} from './databases';

export default async function setup(project: TestProject) {
  const url = testDatabaseUrl();
  if (!url) {
    project.provide('pgcastDb', null);
    return;
  }

  const prefix = runPrefix(process.pid);
  const template = `${prefix}template`;
  const templateUrl = urlForDatabase(url, template);  // throws on a URL we cannot rewrite, before creating anything
  const fixture = readFileSync(new URL('../fixtures/schema.sql', import.meta.url), 'utf8');

  await withAdminClient(url, async client => {
    for (const name of orphanDatabases(await listTestDatabases(client), isProcessAlive)) await dropDatabase(client, name);
    await createDatabase(client, template, 'template0');
  });
  await withAdminClient(templateUrl, client => client.query(fixture));

  project.provide('pgcastDb', { url, template, prefix });

  return async () => {
    await withAdminClient(url, async client => {
      for (const name of await listTestDatabases(client)) {
        if (name.startsWith(prefix)) await dropDatabase(client, name);
      }
    });
  };
}
