import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Template database from test/fixtures/schema.sql (needs TEST_DATABASE_URL).
    globalSetup: ['test/helpers/globalSetup.ts'],
    typecheck: {
      include: ['test/**/*.test-d.ts'],
      tsconfig: './test/tsconfig.json',
    },
  },
});
