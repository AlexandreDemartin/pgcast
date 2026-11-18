import { defineConfig } from 'vitest/config';

// The package's tests, run with the repository root's install (Vitest, pg) and its test helpers: pg reads a database
// per file, copied from the template that ../../test/helpers/globalSetup.ts builds from the fixture (TEST_DATABASE_URL),
// and the adapter a PGlite in memory, with the same fixture. Node runs east of UTC, as the CI's server does not, so that
// a local time read or written as UTC shows; params.test.ts writes its table west of UTC too, by a half-hour offset.
process.env.TZ = 'Asia/Tokyo';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../test/helpers/globalSetup.ts'],
    hookTimeout: 30_000,
  },
});
