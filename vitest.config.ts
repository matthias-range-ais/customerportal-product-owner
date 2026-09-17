import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // app.test.ts and server.test.ts both rename the real frontend/dist/index.html
    // to simulate a missing build; running files in parallel races on that file.
    fileParallelism: false,
  },
});
