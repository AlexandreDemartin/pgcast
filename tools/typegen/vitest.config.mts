import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../test/helpers/globalSetup.ts'],
    hookTimeout: 30_000,
  },
});
