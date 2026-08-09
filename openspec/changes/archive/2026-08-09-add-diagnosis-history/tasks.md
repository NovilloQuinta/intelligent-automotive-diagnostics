## 0. Preparación

- [x] 0.1 Crear `feat/diagnosis-history` desde `develop`
- [x] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [x] 0.3 Cargar contexto: este `proposal.md`/`design.md`, `schema.ts`, `sqlite/vehicleRepository.ts:214-238`, `VehicleRepository.ts` (puerto), `ProcessVehicleDiagnosisUseCase.ts`, `SessionReportPanel.tsx`, `useSessionReport.ts`, `auth.middleware.ts`
- [x] 0.4 Comprobar cómo obtiene el `userId` del token el resto de rutas protegidas y reutilizar ese mecanismo, no inventar otro

## 1. Esquema y migración

- [x] 1.1 Añadir a `diagnosis_sessions`: `userId` (FK a `users`), `resultJson` (text), `severity` (text), `dtcCount` (integer); `vehicleId` pasa a nullable
- [x] 1.2 Generar la migración Drizzle y revisarla a mano — SQLite no soporta todos los `ALTER TABLE`
- [x] 1.3 Verificar que la app arranca contra una base de datos existente sin perder datos ni fallar
- [x] 1.4 Índice sobre `(user_id, started_at)` — es el filtro de todas las consultas del listado

## 2. Puerto y repositorio

- [x] 2.1 RED: test — `endSession` guarda `resultJson`, `severity` y `dtcCount`
- [x] 2.2 GREEN: ampliar `endSession` en el puerto `VehicleRepository` y en el adaptador SQLite
- [x] 2.3 RED: test — `createSession` acepta `vehicleId` nulo sin violar restricciones
- [x] 2.4 GREEN: implementar
- [x] 2.5 RED: test — `findSessions({ userId, from, to, scenarioId, severity, limit, offset })` filtra en SQL y ordena por `startedAt` descendente
- [x] 2.6 GREEN: implementar `findSessions`, devolviendo también el total de coincidencias
- [x] 2.7 RED: test — `findSessions` nunca devuelve sesiones de otro `userId`
- [x] 2.8 RED: test — `findSessionById(id, userId)` devuelve `null` si la sesión es de otro usuario
- [x] 2.9 GREEN: implementar `findSessionById`
- [x] 2.10 REFACTOR: con la suite en verde — revisar que el filtrado no se haya colado en memoria en ningún punto

## 3. Caso de uso: guardar el diagnóstico

- [x] 3.1 RED: test — `ProcessVehicleDiagnosisUseCase` abre sesión al empezar y la cierra con el resultado
- [x] 3.2 GREEN: conectar `createSession`/`endSession` (hoy son código muerto)
- [x] 3.3 RED: test — si el repositorio lanza al guardar, el caso de uso devuelve el diagnóstico igual y registra el error
- [x] 3.4 GREEN: implementar la degradación
- [x] 3.5 RED: test — el snapshot incluye identidad del vehículo, DTCs con descripción, freeze frame y veredicto
- [x] 3.6 GREEN: construir el snapshot
- [ ] 3.7 Medir el tamaño real de un snapshot del Audi con diagnóstico cognitivo incluido; si se dispara, acotar qué se guarda y anotarlo en el reporte
- [x] 3.8 REFACTOR: con la suite en verde — comprobar que el caso de uso no depende de nada de `infrastructure/` (regla de capas)

## 4. Endpoints

- [x] 4.1 RED: test — `GET /api/diagnosis-history` sin token responde 401
- [x] 4.2 RED: test — devuelve solo las sesiones del usuario del token, aunque la query traiga otro `userId`
- [x] 4.3 GREEN: controlador + ruta + schema Zod (`from`, `to`, `scenarioId`, `severity`, `limit`, `offset`), `userId` tomado del token
- [x] 4.4 RED: test — `from` posterior a `to` responde 400
- [x] 4.5 RED: test — la respuesta del listado no incluye `resultJson`
- [x] 4.6 RED: test — paginación: `limit=25&offset=25` devuelve el segundo bloque y el total
- [x] 4.7 RED: test — `GET /api/diagnosis-history/:id` de otro usuario responde 404, no 403
- [x] 4.8 GREEN: endpoint de detalle
- [x] 4.9 Rate limit y documentación Swagger de ambos endpoints, siguiendo el patrón de las rutas existentes
- [x] 4.10 REFACTOR: con la suite en verde — verificar que la lógica de filtros no se duplica entre controlador y repositorio

## 5. UI: pantalla de historial

- [x] 5.1 RED: test — la tabla pinta fecha, vehículo, nº de averías y severidad de cada sesión
- [x] 5.2 GREEN: ruta `/history` + componente de tabla + hook con TanStack Query
- [x] 5.3 RED: test — cambiar el rango de fechas dispara una petición nueva con `from`/`to`; no se filtra en el navegador
- [x] 5.4 GREEN: controles de fecha
- [x] 5.5 RED: test — los atajos "hoy", "7 días", "30 días" calculan el rango y usan los mismos parámetros
- [x] 5.6 RED: test — historial vacío y filtro sin resultados muestran mensajes distintos
- [x] 5.7 GREEN: estados vacíos
- [x] 5.8 Botón "Historial" en `TopBar`
- [x] 5.9 REFACTOR: con la suite en verde — revisar que los estados vacíos no dupliquen componente

## 6. UI: informe histórico

- [x] 6.1 RED: test — `SessionReportPanel` con un snapshot no emite ninguna petición de red
- [x] 6.2 GREEN: admitir snapshot además de composición en vivo, sin duplicar el componente
- [x] 6.3 RED: test — sin snapshot, el panel se comporta exactamente como hoy
- [x] 6.4 RED: test — un informe abierto desde el historial muestra visiblemente su fecha de generación
- [x] 6.5 GREEN: indicador de informe histórico
- [x] 6.6 REFACTOR: con la suite en verde — confirmar que no hay dos caminos de render que puedan divergir

## 7. Verificación manual

- [ ] 7.1 Diagnosticar los tres vehículos y comprobar que aparecen tres entradas en el historial
- [ ] 7.2 Filtrar por un rango que deje fuera alguna sesión y comprobar que desaparece
- [ ] 7.3 Abrir un informe pasado y comprobar en la pestaña de red del navegador que no se lanza ninguna petición de diagnóstico
- [ ] 7.4 Crear un segundo usuario, diagnosticar con él, y comprobar que ninguno ve el historial del otro
- [ ] 7.5 Reiniciar el servidor y comprobar que el historial sigue ahí

## 8. Cierre

- [ ] 8.1 `@security` sobre los dos endpoints nuevos: control de acceso, validación Zod, rate limit
- [ ] 8.2 `@reviewer` sobre el diff completo
- [ ] 8.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, también `pnpm test:ui`
- [ ] 8.4 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 8.5 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 8.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
