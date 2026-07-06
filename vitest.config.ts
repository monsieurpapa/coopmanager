import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Rules tests round-trip the emulator on every assertion; the defaults
    // (5s) flake on cold emulator starts.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
