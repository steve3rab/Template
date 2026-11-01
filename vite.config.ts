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
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'server/src/index.ts',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
      ],
      thresholds: {
        // Keep the existing frontend floor while making server-side access control measurable.
        statements: 45,
        branches: 35,
        functions: 44,
        lines: 47,
        'server/src/**': {
          statements: 25,
          branches: 20,
          functions: 25,
          lines: 25,
        },
      },
    },
  },
});
