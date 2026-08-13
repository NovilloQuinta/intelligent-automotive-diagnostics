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
    // 'dot' emite una linea por fichero en vez de un arbol de 1600 casos.
    // Los fallos se siguen imprimiendo enteros. VITEST_VERBOSE=1 para el arbol.
    reporters: process.env.VITEST_VERBOSE ? ['default'] : ['dot'],
    // Los tests que pasan escupen logs de pino y del SDK a stderr. Silenciarlos
    // deja solo la salida de los que fallan, que es la unica accionable.
    silent: process.env.VITEST_VERBOSE ? false : 'passed-only',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      // 'text' imprime una fila por fichero (~195). 'text-summary' son 6 lineas
      // y los ficheros bajo umbral se siguen reportando como error.
      reporter: ['text-summary', 'json-summary', 'html'],
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
        '**/isotp/index.ts',
        // Infraestructura (0% por estrategia): cableado DI, adaptadores que
        // delegan, controladores HTTP, factories y helpers de glue. Validados
        // por TypeScript/ESLint, no por tests de cobertura.
        '**/composition.ts',
        '**/simulatorAdapter.ts',
        '**/lancedb.ts',
        '**/AdminController.ts',
        '**/ProfileController.ts',
        '**/httpErrors.ts',
        '**/composeLlmClient.ts',
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
