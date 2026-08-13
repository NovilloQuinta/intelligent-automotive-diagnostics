import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // 'dot' emite una linea por fichero en vez de un arbol de casos.
    // Los fallos se siguen imprimiendo enteros. VITEST_VERBOSE=1 para el arbol.
    reporters: process.env.VITEST_VERBOSE ? ["default"] : ["dot"],
    // Los tests que pasan escupen warnings de React/console a stderr. Silenciarlos
    // deja solo la salida de los que fallan, que es la unica accionable.
    silent: process.env.VITEST_VERBOSE ? false : "passed-only",
    coverage: {
      provider: "v8",
      // 'text' imprime una fila por fichero (~90). 'text-summary' son 6 lineas
      // y los ficheros bajo umbral se siguen reportando como error.
      reporter: ["text-summary", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**", // 48 shadcn/ui — TIER INFRA
        "src/main.tsx", // entry point
        "src/start.ts", // SSR scaffold (inactivo)
        "src/server.ts", // infra de servidor
        "src/router.tsx", // infra de routing
        "src/routeTree.gen.ts", // generado
        "src/styles.css", // CSS
        "src/components/dashboard/types.ts", // tipos puros
        "src/hooks/use-mobile.tsx", // shadcn/ui hook — TIER INFRA
        "src/lib/utils.ts", // shadcn/ui utility — TIER INFRA
        "src/routes/__root.tsx", // infrastructure: route config + providers + Toaster
      ],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 85,
        lines: 80,
        perFile: true,
      },
    },
  },
});
