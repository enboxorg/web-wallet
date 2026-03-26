import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/e2e/**', 'node_modules'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json-summary', 'json'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/e2e/**',
        'src/vite-env.d.ts',
        'src/vitest.setup.ts',
        'src/sw.ts',
        'src/main.tsx',
      ],
      thresholds: {
        // Baseline — raise as coverage improves
        statements: 25,
        branches: 29,
        functions: 30,
        lines: 25,
      },
    },
  },
});
