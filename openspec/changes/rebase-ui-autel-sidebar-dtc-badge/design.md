## Context

`feat/restructure-ui-autel-flow` diverge de `develop` en `d621d8a` (merge-base). Desde ahí, `develop` avanzó 20 commits, de los cuales estos tocan `apps/ui`:

- `fcad8b3` / `7e87896` / `685e507` — panel de administración completo (backend + UI), incluye tipos/métodos `Admin*` en `apps/ui/src/lib/api.ts` y rutas `apps/ui/src/routes/admin*.tsx`
- `3a3950d` — diagnóstico automático al seleccionar vehículo + monitores en verde (toca `DashboardPage.tsx`)
- `e6fc320` / `f9da5f7` — sidebar de navegación del layout admin (rutas `/admin/*`, no comparte componentes con el dashboard principal)
- `98b6b16` / `8898b3f` — fixes del chat mecánico: limpieza de bloque JSON, CSS de scroll, formato de `conversationHistory` (toca `MechanicChat.tsx`)

Comparando el árbol de ficheros tocados por ambas ramas desde el merge-base (`git diff --name-only d621d8a dc91cec` ∩ `git diff --name-only d621d8a develop`), el conflicto real de rebase se reduce a 5 ficheros:

```
apps/ui/src/components/dashboard/DashboardPage.tsx
apps/ui/src/components/dashboard/MechanicChat.tsx
apps/ui/src/components/dashboard/TopBar.tsx
apps/ui/tests/unit/components/DashboardPage.test.tsx
apps/ui/tests/unit/components/TopBar.test.tsx
```

Todo lo demás que la rama toca (los ~25 componentes `apps/ui/src/components/ui/*` eliminados, los hooks migrados a TanStack Query: `useScenarios`, `useEcuInfo`, `useFreezeFrame`, `usePendingDtc`, `usePermanentDtc`, `useVehicleStatus`, `useCapabilities`) no tiene commits paralelos en `develop` desde el merge-base y rebasa sin conflicto — `git rebase` los reproduce directamente.

Se verificó (`git grep` sobre `develop`) que ninguno de los ~25 componentes `ui/*` que la rama borra está referenciado fuera de sí mismos: las únicas referencias cruzadas son entre componentes que también están en la lista de borrado (`sidebar.tsx` importa `separator`, `sheet`, `tooltip`; `command.tsx` importa `dialog`; `toggle-group.tsx` importa `toggle`). El borrado es seguro.

El badge de DTC activos (punto 2 del encargo) **ya está implementado** en `dc91cec`: `DashboardPage.tsx` calcula `dtcCount = result?.dtcCodes?.length ?? 0` y lo propaga por props hasta `Sidebar.tsx`, que renderiza un `<span>` condicional (`item.id === "dtc" && dtcCount`) sobre el icono. No existe ningún test de `Sidebar.tsx` ni de `DashboardLayout.tsx` en el árbol (`apps/ui/tests/unit/components/` no tiene ficheros para esos dos componentes). El trabajo de este punto es, por tanto, cerrar ese hueco de cobertura con TDD, no reimplementar la funcionalidad.

## Goals / Non-Goals

**Goals:**
- Rebase limpio de `dc91cec` sobre `develop` sin perder trabajo de ninguna de las dos ramas
- Cobertura de test para `Sidebar.tsx` (badge) y `DashboardLayout.tsx`, ausente hoy
- `pnpm lint && pnpm format && pnpm test && pnpm build` en verde tras el rebase, scope `apps/ui`

**Non-Goals:**
- No se rediseña el layout del sidebar más allá de lo ya decidido (ocho iconos fijos, sin colapsar/expandir)
- No se toca `apps/core-api` ni contratos HTTP
- No se re-evalúa si TanStack Query es la elección correcta para los hooks de dashboard — ya es un hecho consumado en `dc91cec` y se preserva tal cual

## Decisions

### D1 — Rebase interactivo fichero a fichero, no merge
`git rebase develop` (no `git merge`) para mantener el commit único de la rama con historia lineal, tal como pide el flujo de worktree por spec del proyecto. Los 5 ficheros conflictivos se resuelven a mano combinando ambos lados; el resto se aplica automáticamente.

### D2 — Reconciliación de `DashboardPage.tsx`
Base: la versión de `dc91cec` (con `DashboardLayout`/`Sidebar`/`activeSection`). Se reinyecta desde `develop`:
- el `useEffect` de diagnóstico automático al seleccionar vehículo (dispara `runDiagnosis` + `cognitive.trigger` cuando `selectedId` cambia)
- cualquier cambio en `VehicleStatusPanel`/monitores en verde asociado a ese commit, si vive en este fichero
El `dtcCount`/`hasDiagnosis` que ya calcula `dc91cec` es compatible sin cambios con el diagnóstico automático: solo cambia cuándo se dispara `runDiagnosis`, no cómo se deriva el recuento.

### D3 — Reconciliación de `TopBar.tsx`: el link Admin no se pierde
`dc91cec` quitó `onReportClick` (correcto: el informe es ahora una sección del sidebar, `"report"`) pero de paso quitó el `Link to="/admin"` condicionado a `auth.user?.isAdmin` que `develop` había añadido. Decisión: reintroducir ese link en `TopBar.tsx` (mismo sitio, junto al botón de logout) en vez de moverlo al sidebar de 8 iconos fijos — el sidebar representa secciones del dashboard de diagnóstico, no navegación entre módulos de la app, y añadir un noveno icono ahí mezclaría dos niveles de navegación distintos. `auth-context.tsx` no cambió entre las dos ramas, así que `isAdmin` está disponible sin trabajo adicional.

### D4 — Reconciliación de `MechanicChat.tsx`
Ambas ramas tocan el contenedor de scroll del historial de conversación (`develop` fija el bug de scroll con `max-h-80 min-h-0`; `dc91cec` lo cambia a `max-h-64` sin el `min-h-0`) y `dc91cec` añade el type guard `isSeverityKey` (mejora de tipos, sin conflicto de comportamiento). Decisión: conservar el fix de `develop` (`max-h-80 min-h-0`) — es el que corrige la regresión de scroll ya documentada — y aplicar sobre él el resto de cambios de tipos de `dc91cec` (`isSeverityKey`, `SeverityKey`). No se ajusta la altura a `max-h-64`.

### D5 — `routeTree.gen.ts` no se mergea a mano
Es un fichero generado por TanStack Router. Tras resolver los 5 conflictos reales, se regenera con el comando de build/dev del router en vez de resolver su conflicto de texto.

### D6 — Badge de DTC: TDD sobre implementación ya existente
Como la lógica del badge ya existe en `dc91cec`, el ciclo TDD de `tasks.md` escribe primero los tests de `Sidebar.tsx` (y de `DashboardLayout.tsx` para la propagación de `dtcCount`) esperando que fallen en RED contra el árbol *pre-rebase* solo por ausencia de fichero de test — no porque falte código de producción. Si al escribir los tests aparece un caso no cubierto por la implementación actual (p. ej. formato de badges con recuento > 99, o el caso "cambio de vehículo limpia el badge" que depende de la key de TanStack Query en `useDiagnosis`), el GREEN task añade el fix mínimo necesario. El REFACTOR final revisa si `Sidebar.tsx` necesita extraer el bloque de badge a un subcomponente ahora que tiene test propio.

## Risks / Trade-offs

- **[Riesgo]** Resolver mal D2/D3/D4 en el rebase pierde silenciosamente comportamiento de `develop` sin que ningún test lo detecte (los tests de `DashboardPage.test.tsx`/`TopBar.test.tsx` existentes en `develop` también son parte del conflicto de rebase) → **Mitigación**: tasks.md exige, tras el rebase, ejecutar `pnpm test -- DashboardPage TopBar MechanicChat` y revisar manualmente que los tests migrados de `develop` para diagnóstico automático y link Admin siguen presentes y en verde, no solo que la suite completa pase.
- **[Riesgo]** `routeTree.gen.ts` divergente entre ramas puede generar un diff enorme y ruidoso si se resuelve a mano → **Mitigación**: D5, regenerar en vez de mergear.
- **[Trade-off]** Reintroducir el link Admin en `TopBar` (D3) en vez de en el sidebar mantiene dos superficies de navegación (top bar para módulos de la app, sidebar para secciones del dashboard); se acepta porque ya era así en `develop` y no es parte del encargo rediseñarlo.
