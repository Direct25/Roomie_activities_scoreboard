import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API test files share one database and wipe it between tests.
    fileParallelism: false,
  },
});
