import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', 'test-results/**', 'playwright-report/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', '**/*.d.ts', '**/*.test.{ts,tsx}'],
      // Temporary regression floor aligned with the current measured baseline.
      // Raise these values as coverage is added for the account, seller, and commerce flows.
      thresholds: {
        statements: 45,
        branches: 35,
        functions: 44,
        lines: 47,
      },
    },
  },
});
