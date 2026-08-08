## Why

`feat/restructure-ui-autel-flow` (1 commit, `dc91cec`) reemplaza el dashboard apilado de una sola pantalla por un layout con sidebar de navegación por secciones (`DashboardLayout` + `Sidebar`), ya comparado visualmente contra `develop` y adoptado por decisión del usuario. La rama está 20 commits por detrás de `develop`, que en ese intervalo añadió el panel de administración, el diagnóstico automático al seleccionar vehículo, y fixes del chat mecánico. Sin rebase, mergear la rama tal cual perdería esas 20 commits de trabajo; sin cuidado en la resolución de conflictos, el rebase perdería a su vez la reestructuración de sidebar, el link a Admin del `TopBar`, o el diagnóstico automático de `develop`.

Además, al pasar de un dashboard de una sola pantalla a secciones navegables, el mecánico ya no ve el panel de DTCs "de un vistazo": para saber si hay averías activas tiene que entrar a la sección "Códigos DTC". Un badge numérico sobre ese icono del sidebar compensa la pérdida de visibilidad.

## What Changes

- Rebasear `feat/restructure-ui-autel-flow` sobre `develop` preservando explícitamente, en la resolución de conflictos:
  - el diagnóstico automático al seleccionar vehículo y el efecto de "monitores en verde" en `DashboardPage.tsx` (añadidos en `develop` tras el punto en que se creó la rama)
  - el link "Admin" (visible solo si `auth.user.isAdmin`) que `develop` añadió a `TopBar.tsx`, reubicándolo en el nuevo layout con sidebar si `TopBar` deja de alojarlo
  - los fixes del chat mecánico de `develop` en `MechanicChat.tsx` (limpieza del bloque JSON, CSS de scroll, formato de `conversationHistory`)
  - las adiciones del panel de administración a `apps/ui/src/lib/api.ts` (tipos y métodos `Admin*`), que la rama no tiene porque se creó antes de que existieran
- Eliminar del árbol reconstruido los ~25 componentes `apps/ui/src/components/ui/*` sin usar que la rama ya identificó como muertos (verificado: ninguno referenciado fuera de sí mismos en `develop`)
- Añadir un badge con el recuento de DTC activos sobre el icono "Códigos DTC" en `Sidebar.tsx` — **verificar primero**: `dc91cec` ya incluye esta pieza (`dtcCount` prop propagada desde `DashboardPage` → `DashboardLayout` → `Sidebar`, renderizado condicional del badge), pero sin ningún test; el trabajo real de este punto es cubrir ese comportamiento con TDD, no reimplementarlo
- Verificación post-rebase: `pnpm lint && pnpm format && pnpm test && pnpm build`, con scope en `apps/ui`

**BREAKING**: ninguno — cambio interno de UI, sin contrato de API afectado. Solo frontend; `apps/core-api` no se toca.

## Capabilities

### New Capabilities
- `dashboard-sidebar-navigation`: layout del dashboard con sidebar de navegación por secciones, incluyendo el badge de DTC activos sobre el icono correspondiente

### Modified Capabilities
(ninguna — no existe spec previo de UI del dashboard; el layout de una sola pantalla nunca se documentó como capability)

## Impact

- **Código afectado**: `apps/ui/src/components/layout/{DashboardLayout,Sidebar}.tsx`, `apps/ui/src/components/dashboard/{DashboardPage,TopBar,MechanicChat}.tsx`, `apps/ui/src/lib/api.ts`, hooks de dashboard ya migrados a TanStack Query en la rama (`useScenarios`, `useEcuInfo`, `useFreezeFrame`, `usePendingDtc`, `usePermanentDtc`, `useVehicleStatus`, `useCapabilities`), tests unitarios de `DashboardPage` y `TopBar`, `apps/ui/src/components/ui/*` (35 ficheros eliminados), `apps/ui/src/routeTree.gen.ts` (regenerado, no mergeado a mano)
- **No afectado**: `apps/core-api`, esquema de base de datos, contratos de API existentes
- **Riesgo principal**: conflictos de rebase concentrados en 5 ficheros tocados por ambas ramas (`DashboardPage.tsx`, `TopBar.tsx`, `MechanicChat.tsx` y sus tests); el resto de la superficie tocada por la rama (hooks, hoja de componentes `ui/`) no tiene commits paralelos en `develop` y rebasa sin conflicto
