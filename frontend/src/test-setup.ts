import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library's automatic cleanup relies on a global `afterEach`, which
// this project's Vitest config doesn't enable (`test.globals` is unset) — so
// without this, each test's rendered DOM stacks up across the file.
afterEach(() => {
  cleanup();
});
