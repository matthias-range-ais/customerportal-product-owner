/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // `vite build --watch` (see the root "dev:full" script) reruns this build on every
    // frontend change while the backend serves this same directory. Emptying it up front
    // would briefly delete index.html mid-rebuild and crash the running server's static-file
    // registration; keeping old hashed assets around between rebuilds is a fine dev-only cost.
    emptyOutDir: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
