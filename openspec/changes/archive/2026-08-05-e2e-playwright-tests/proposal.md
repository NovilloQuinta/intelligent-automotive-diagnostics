## Why

El dashboard tiene 160 tests unitarios con 97% coverage, pero cero tests de integración end-to-end. Los tests unitarios con jsdom no detectaron que `main.tsx` no importaba `styles.css` — la app se veía en blanco y nadie se enteró hasta probarla manualmente.

Se necesitan tests E2E con Playwright que validen los flujos reales del usuario contra la aplicación funcionando (frontend + backend).

## What Changes

- Nuevo directorio `apps/ui/tests/e2e/` con tests Playwright
- 7 escenarios que cubren el ciclo completo del usuario
- Script `test:e2e` en `apps/ui/package.json`
- Configuración de Playwright con webServer auto-start (backend + frontend)

## Capabilities

### New Capabilities
- `e2e-tests`: Tests end-to-end con Playwright que validan login, registro, diagnóstico y logout sobre la app real.

## Impact

- Nuevo: `apps/ui/tests/e2e/auth.e2e.ts` (registro, login válido, login inválido)
- Nuevo: `apps/ui/tests/e2e/dashboard.e2e.ts` (cambio vehículo, diagnóstico con/sin DTCs)
- Nuevo: `apps/ui/tests/e2e/logout.e2e.ts` (logout y redirección)
- Nuevo: `apps/ui/playwright.config.ts`
- Modificado: `apps/ui/package.json` (script `test:e2e`)
