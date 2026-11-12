// Copyright (C) 2026 Alexandre Demartin
// Shared by generate-schema.mjs and run-examples.mjs, which load schema.sql into pgcast_test_<pid>_docs (and
// run-examples.mjs into its _copy). Their `finally` does not run on Ctrl-C, SIGKILL or a crash: the next run drops
// what such a run left, as orphanDatabases() in test/helpers/databases.ts does for the tests.

const isAlive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';  // exists, owned by someone else
  }
};

/** Drop `pgcast_test_<pid>_docs` and its `_copy` where process `<pid>` is gone, or is this one (its pid reused). */
export async function dropOrphanDocsDatabases(admin) {
  const { rows } = await admin.query(
    String.raw`SELECT datname FROM pg_database WHERE datname ~ '^pgcast_test_\d+_docs(_copy)?$'`);
  for (const { datname } of rows) {
    const pid = Number(datname.split('_')[2]);
    if (pid === process.pid || !isAlive(pid)) await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }
}
