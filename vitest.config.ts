import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['utils/**/*.test.ts', 'services/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['utils/**/*.ts', 'services/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
