import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'scripts/**',
        'src/domain/**',
        '**/simulationScenario.ts',
        '**/*.interface.ts',
        '**/*.port.ts',
        '**/seed-pids.ts',
        '**/db.ts',
        '**/schema.ts',
        '**/swagger.ts',
        '**/server.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 90,
        lines: 80,
        perFile: true,
        'src/application/use-cases/processVehicleDiagnosis.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
})
