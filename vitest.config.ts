import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'ajv/dist/2020.js': path.resolve(__dirname, './src/vendor/ajv-2020-csp.ts'),
    },
  },
  define: {
    '__ENBOX_AUTH_SDK_VERSION__': JSON.stringify('test'),
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/vitest.setup.ts'],
    server: {
      deps: {
        inline: ['@enbox/dwn-sdk-js'],
      },
    },
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
