import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // mobile/ has its own toolchain; only the shared engine is tested here
    include: ['engine/**/*.test.ts'],
  },
});
