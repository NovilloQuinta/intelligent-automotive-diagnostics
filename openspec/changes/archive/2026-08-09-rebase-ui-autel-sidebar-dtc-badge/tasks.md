## 1. Preparación

- [ ] 1.1 Confirmar árbol de trabajo limpio (`git status`) y anotar el commit actual de la rama (`dc91cec`) antes de reescribir historia
- [ ] 1.2 `git fetch origin develop` (o equivalente local) y confirmar que `develop` local está actualizado al commit usado en este proposal
- [ ] 1.3 Listar de nuevo, justo antes de rebasear, los ficheros en conflicto potencial (`git diff --name-only <merge-base> HEAD` ∩ `git diff --name-only <merge-base> develop`) por si `develop` avanzó desde que se escribió este proposal

## 2. Rebase mecánico

- [ ] 2.1 `git rebase develop`
- [ ] 2.2 Para cada conflicto en `apps/ui/src/components/ui/*` (componentes eliminados por la rama): resolver aceptando el borrado (`git rm <file>`) — ya verificado como código muerto en design.md
- [ ] 2.3 Para el conflicto en `apps/ui/src/routeTree.gen.ts`: descartar el merge manual y regenerar el fichero con el comando del router tras terminar el rebase (D5 de design.md), no resolver el conflicto de texto
- [ ] 2.4 Resolver el conflicto en `apps/ui/src/lib/api.ts` aceptando ambos lados (tipos/métodos `Admin*` de `develop` + lo que ya tenía la rama)
- [ ] 2.5 Dejar sin resolver, de momento, los conflictos en `DashboardPage.tsx`, `TopBar.tsx`, `MechanicChat.tsx` y sus tests — se resuelven en la sección 3 con el detalle de D2/D3/D4
- [ ] 2.6 Resolver los conflictos restantes de la sección 2.5 aplicando D2 (diagnóstico automático + monitores en `DashboardPage.tsx`), D3 (link Admin reintroducido en `TopBar.tsx`) y D4 (`max-h-80 min-h-0` conservado + `isSeverityKey` en `MechanicChat.tsx`)
- [ ] 2.7 `git rebase --continue` hasta terminar; confirmar `git log --oneline` con la rama reescrita sobre `develop` y un solo commit propio (o los que resulten de dividir el trabajo de esta sección, si se decide comitear la resolución aparte)
- [ ] 2.8 Regenerar `routeTree.gen.ts` (comando del router) y confirmar que no queda ningún marcador de conflicto (`<<<<<<<`) en el árbol: `git grep -n "<<<<<<<"`

## 3. Verificar comportamiento reconciliado de `develop` (RED → GREEN → REFACTOR)

- [ ] 3.1 RED — ejecutar `pnpm --filter ui test -- DashboardPage TopBar MechanicChat` inmediatamente tras 2.7 y confirmar en rojo o en verde con qué falla: identificar si el diagnóstico automático al seleccionar vehículo, el link Admin condicionado a `isAdmin`, o el fix de scroll del chat se perdieron en la resolución de conflictos
- [ ] 3.2 GREEN — si 3.1 detecta pérdida de comportamiento, corregir `DashboardPage.tsx`/`TopBar.tsx`/`MechanicChat.tsx` hasta que los tests migrados de `develop` para esos tres comportamientos pasen, sin revertir lo que aporta `dc91cec` (sidebar, `activeSection`, tipos `SeverityKey`)
- [ ] 3.3 REFACTOR — con la suite en verde, revisar `DashboardPage.tsx` en busca de duplicación entre el bloque `vehicleReady === false` y el `renderSection()` introducidos por el merge de ambas ramas; extraer o renombrar si corresponde. Si no hace falta refactor, marcar esta tarea como revisada sin cambios

## 4. Badge de DTC activos en `Sidebar.tsx` (RED → GREEN → REFACTOR)

- [ ] 4.1 RED — crear `apps/ui/tests/unit/components/Sidebar.test.tsx` cubriendo los 5 escenarios de `specs/dashboard-sidebar-navigation/spec.md` (sin badge sin diagnóstico, sin badge con 0 DTCs, badge con recuento N, badge se actualiza a M al re-diagnosticar, badge no se muestra el valor del vehículo anterior tras cambiar de vehículo) y confirmar que el fichero de test corre y falla solo por los casos aún no cubiertos (si alguno falla por comportamiento real, no por ausencia de fixture)
- [ ] 4.2 GREEN — si 4.1 revela un caso no cubierto por la implementación actual de `Sidebar.tsx` (p. ej. formateo cuando `dtcCount` supera un umbral visual), aplicar el cambio mínimo en `Sidebar.tsx`/`DashboardLayout.tsx` para que pase; si los 5 escenarios ya pasan con el código existente, dejar constancia explícita en el commit de que 4.1 fue confirmatorio, no productivo
- [ ] 4.3 REFACTOR — con los tests en verde, evaluar si el bloque de renderizado del badge dentro de `Sidebar.tsx` (líneas del `map` de `SECTIONS`) merece extraerse a un subcomponente `SidebarBadge` ahora que tiene cobertura propia; aplicar si mejora legibilidad, o marcar como revisado sin cambios

## 5. Cobertura de `DashboardLayout.tsx` (RED → GREEN → REFACTOR)

- [ ] 5.1 RED — crear `apps/ui/tests/unit/components/DashboardLayout.test.tsx` verificando que `dtcCount`/`hasDiagnosis` recibidos por `DashboardLayout` se propagan sin transformación a `Sidebar`, y que `TopBar` recibe `streamOk`/`loading`/`onLogout` correctamente
- [ ] 5.2 GREEN — ajustar `DashboardLayout.tsx` solo si 5.1 detecta una propagación incorrecta; en el caso esperado (ya funciona), dejarlo confirmatorio
- [ ] 5.3 REFACTOR — con la suite en verde, revisar si `DashboardLayoutProps` puede tipar mejor el subconjunto de props que reenvía a `TopBar` vs `Sidebar` (p. ej. agrupando en objetos `topBarProps`/`sidebarProps`) sin romper la API pública del componente; aplicar si aporta claridad, o marcar como revisado sin cambios

## 6. Verificación final

- [ ] 6.1 `pnpm --filter ui lint`
- [ ] 6.2 `pnpm --filter ui format` (o `format:fix` si hay diffs de formato pendientes, revisando el diff resultante antes de commitear)
- [ ] 6.3 `pnpm --filter ui test`
- [ ] 6.4 `pnpm --filter ui build`
- [ ] 6.5 `pnpm --filter ui test:coverage` (si existe el script) y confirmar que `Sidebar.tsx`/`DashboardLayout.tsx` cumplen el umbral de Features (>=80% por fichero) fijado en `coverage-strategy`
- [ ] 6.6 Revisión manual final: cargar el dashboard con un escenario que tenga DTCs y confirmar visualmente el badge sobre el icono "Códigos DTC", y confirmar que el link Admin sigue visible para un usuario admin
