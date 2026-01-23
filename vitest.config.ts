import { defineConfig } from 'vitest/config';
import { codecovVitePlugin } from '@codecov/vite-plugin';

export default defineConfig({
  plugins: [
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'mcp-factorial',
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'dist/',
        'node_modules/',
        '**/*.test.ts',
        '**/*.config.*',
        'src/__tests__/fixtures/**',
        'src/index.ts', // Re-export only
        'src/api.ts', // Re-export only
        'src/schemas.ts', // Re-export only
        'src/types.ts', // Type re-exports only
        'src/tools/**', // MCP tool registrations - delegate to well-tested API functions
        'src/schemas/**', // Zod schema definitions - type definitions
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-results/junit.xml',
    },
    mockReset: true,
    restoreMocks: true,
  },
});
