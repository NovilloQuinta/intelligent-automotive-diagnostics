# Tasks — e2e-playwright-tests

Rama: `main`. Baseline: 160 tests UI unitarios + 453 core-api.

## 0. Configuración

- [x] 0.1 Instalar `@playwright/test` + `npx playwright install chromium`
- [x] 0.2 Crear `apps/ui/playwright.config.ts` con webServer auto-start
- [x] 0.3 Añadir script `"test:e2e"` en `apps/ui/package.json`

## 1. RED — Test de auth (registro, login, error)

- [x] 1.1 Crear `apps/ui/tests/e2e/auth.spec.ts` con 3 tests
- [x] 1.2 RED inicial — rate limiter bloqueaba, corregido

## 2. GREEN — Auth tests

- [x] 2.1 Fix rate limiter: `NODE_ENV !== 'production'` → skip en dev
- [x] 2.2 `pnpm test:e2e` — 3/3 auth GREEN

## 3. RED — Test de dashboard

- [x] 3.1 Crear `apps/ui/tests/e2e/dashboard.spec.ts` con 4 tests
- [x] 3.2 Ajustar selectores strict mode (`.first()`, `getByRole`)

## 4. GREEN — Dashboard tests

- [x] 4.1 Strict mode fixes aplicados
- [x] 4.2 `registerAndLogin()` con suffix único por test
- [x] 4.3 4/4 dashboard GREEN

## 5. Test de logout

- [x] 5.1 Crear `apps/ui/tests/e2e/logout.spec.ts`
- [x] 5.2 Verificar localStorage limpio tras logout
- [x] 5.3 1/1 logout GREEN

## 6. Suite completa

- [x] 6.1 `pnpm test:e2e` — 8/8 GREEN (36.2s)

## 7. CIERRE

- [x] 7.1 Commit y push a main
- [x] 7.2 Archivar change en OpenSpec
