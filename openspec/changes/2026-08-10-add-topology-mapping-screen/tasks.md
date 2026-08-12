## 1. RED — `ecuTopologyColors`: color por tipo con fallback determinista

- [ ] 1.1 Crear `apps/ui/tests/unit/components/ecuTopologyColors.test.ts`:
  - `getEcuTopologyColor('ECM')`, `('TCM')`, `('ABS')`, `('BCM')`, `('SRS')`, `('IPC')` → cada uno devuelve un color distinto y estable (snapshot de valor fijo, no `undefined`)
  - `getEcuTopologyColor('UNKNOWN_TYPE')` → devuelve un color de fallback válido, sin lanzar
  - `getEcuTopologyColor('UNKNOWN_TYPE')` invocado dos veces → devuelve el mismo color ambas veces (determinismo)
  - `getEcuTopologyColor('otro-tipo-no-catalogado')` → color de fallback distinto al de `'UNKNOWN_TYPE'` (para verificar que el fallback depende del string, no es un único color fijo para "todo lo demás" — o, si se opta por un único gris neutro para todo lo no catalogado, el test cubre explícitamente esa decisión en vez de asumir hashing)

## 2. GREEN — Implementar `ecuTopologyColors.ts`

- [ ] 2.1 Crear `apps/ui/src/components/dashboard/ecuTopologyColors.ts`: mapa `Record<string, string>` para `ECM/TCM/ABS/BCM/SRS/IPC` + función `getEcuTopologyColor(type: string): string` con fallback determinista para tipos no catalogados

## 3. REFACTOR — Bloque 1

- [ ] 3.1 Revisar paleta contra `COLORS`/`GRADIENTS` ya definidos en `apps/ui/src/components/dashboard/types.ts` — reutilizar tokens existentes en vez de introducir hex sueltos si el contraste lo permite
- [ ] 3.2 `pnpm --filter ui test ecuTopologyColors` en verde antes de continuar

## 4. RED — `TopologyMapPanel`: layout por conteo de ECUs + selección de nodo

- [ ] 4.1 Crear `apps/ui/tests/unit/components/TopologyMapPanel.test.tsx`:
  - `selectedId: null` → `PanelState state="empty"` invitando a seleccionar vehículo
  - `selectedId` presente, `loading: true` → `PanelState state="loading"`
  - `selectedId` presente, `error` presente → `PanelState state="error"`
  - `ecus: []` → estado vacío "Sin ECUs descubiertas" (mismo mensaje que `EcuInfoPanel`)
  - `ecus` con 1 elemento → renderiza un único nodo + leyenda de "única ECU detectada" / limitación de descubrimiento
  - `ecus` con 5 elementos (fixture tipo escenario Audi A3: `ECM, TCM, ABS, BCM, SRS`) → renderiza 5 nodos, ninguno con posición duplicada
  - `ecus` con 3 elementos (fixture tipo Kawasaki Z900: `ECM, ABS, IPC`) → renderiza 3 nodos
  - Click en un nodo → aparece tarjeta de detalle con `name`, `requestAddr → responseAddr`, `protocol`
  - Click en un nodo distinto tras haber uno seleccionado → la tarjeta de detalle cambia a la nueva ECU (no se acumulan tarjetas)
  - Nodo de una ECU con `type: 'ABS'` → su color inline/clase coincide con `getEcuTopologyColor('ABS')`

## 5. GREEN — Implementar `TopologyMapPanel`

- [ ] 5.1 Crear `apps/ui/src/components/dashboard/TopologyMapPanel.tsx`: props `{ ecus: EcuInfo[], loading: boolean, error: string | null, selectedId: string | null }` (misma forma de props que `EcuInfoPanel`, para reutilizar `ecu={{ ecus, loading, error }}` ya construido en `DashboardPage`)
- [ ] 5.2 Layout SVG puro a partir de `ecus.length` (0 / 1 / N≥2) — sin `useState` de posición, solo `useState<number | null>` para el nodo seleccionado
- [ ] 5.3 Usar `getEcuTopologyColor(ecu.type)` para colorear cada nodo
- [ ] 5.4 Tarjeta de detalle inline al seleccionar nodo (reutilizar estilos `panel`/`mono` ya usados en `EcuInfoPanel`/`EcuTable`)

## 6. REFACTOR — Bloque 2

- [ ] 6.1 Extraer constantes de layout SVG (radios, espaciado, altura de la línea de bus) a `types.ts` o a un bloque de constantes en el propio módulo, siguiendo el patrón de `GAUGE`/`SVG_STROKES` — nada de números mágicos sueltos en el JSX
- [ ] 6.2 Revisar duplicación con `EcuTable`/`EcuInfoPanel` (mensajes de estado vacío/error) — extraer mensaje compartido si el texto es literalmente el mismo string en dos sitios
- [ ] 6.3 `pnpm --filter ui test TopologyMapPanel` en verde antes de continuar

## 7. RED — Integración en `Sidebar` + `DashboardSection`

- [ ] 7.1 Añadir en `apps/ui/tests/unit/components/Sidebar.test.tsx`: item "Topología" visible con `getByTitle`, `onChange` invocado con `'topology'` al hacer click
- [ ] 7.2 Añadir/crear test para `DashboardSection` (nuevo archivo `apps/ui/tests/unit/components/DashboardSection.test.tsx` si no existe cobertura previa, o extender el test de `DashboardPage` existente): `activeSection: 'topology'` renderiza `TopologyMapPanel` con las props de `ecu` recibidas

## 8. GREEN — Implementar integración

- [ ] 8.1 Modificar `apps/ui/src/components/layout/Sidebar.tsx`: añadir `'topology'` a `SidebarSection`, entrada en `SECTIONS` con icono `lucide-react` (p. ej. `Network` o `GitBranch`) y etiqueta "Topología"
- [ ] 8.2 Modificar `apps/ui/src/components/dashboard/DashboardSection.tsx`: `case 'topology': return <TopologyMapPanel ecus={ecus ?? []} loading={ecusLoading} error={ecusError} selectedId={selectedId!} />` (reutiliza el mismo `EcuState` ya recibido por `DashboardSection`, sin nuevas props de nivel superior en `DashboardPage`)

## 9. REFACTOR — Bloque 3

- [ ] 9.1 Confirmar que `DashboardPage.tsx` no necesita cambios (ya construye y pasa `ecu={{ ecus, loading: ecusLoading, error: ecusError }}` a `DashboardSection`) — si hiciera falta algún ajuste menor, mantenerlo mínimo y documentarlo aquí
- [ ] 9.2 `pnpm --filter ui test Sidebar` en verde antes de continuar

## 10. Verificación final

- [ ] 10.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 10.2 `pnpm test:coverage` — confirmar que los ficheros nuevos (`TopologyMapPanel.tsx`, `ecuTopologyColors.ts`) cumplen el umbral Features ≥80%
- [ ] 10.3 (Opcional, si el layout definitivo lo justifica) Añadir un caso en `apps/ui/tests/e2e/dashboard.spec.ts` que navegue a la pestaña "Topología" y verifique que se renderiza al menos un nodo con un vehículo seleccionado
- [ ] 10.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
