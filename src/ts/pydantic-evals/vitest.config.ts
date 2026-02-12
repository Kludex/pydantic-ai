import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/otel/context-in-memory-exporter.ts',
        'src/otel/context-subtree.ts',
        'src/evaluators/llm-judge.ts',
        'src/reporting/renderer.ts',
        'src/index.ts',
        'src/evaluators/index.ts',
        'src/otel/index.ts',
        'src/reporting/index.ts',
        'src/serialization/index.ts',
        'src/reporting/analyses.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
