import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Template database from test/fixtures/schema.sql (needs TEST_DATABASE_URL).
    globalSetup: ['test/helpers/globalSetup.ts'],
    // The beforeAll of useTestDatabase() (test/helpers/db.ts) once took more than the 10 s default on CI.
    hookTimeout: 30_000,
    // Type tests compile against the fixture's generated schema and the declarations of
    // src/db, which `npm run test:types` emits first (test/types/tsconfig.json).
    typecheck: {
      include: ['test/types/**/*.test-d.ts'],
      tsconfig: './test/types/tsconfig.json',
    },
  },
});
