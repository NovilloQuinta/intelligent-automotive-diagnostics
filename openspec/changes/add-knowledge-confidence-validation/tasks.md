## 0. Preparación

- [x] 0.1 Confirmar que `add-rag-cognitive-retrieval` está mergeado a `develop` (o crear esta rama desde `feat/rag-cognitive-retrieval` si aún no lo está); crear `feat/knowledge-confidence-validation`
- [x] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, anotar nº de tests
- [x] 0.3 Cargar contexto: ADR-007 §4, este `proposal.md`/`design.md`, `PidKnowledgeEntry`/`DtcKnowledgeEntry`/`DiagnosisKnowledgeEntry`, `PidFormulaCatalog`, `elm327Adapter.ts`, `simulator.ts`

## 1. Esquema de confianza en las entradas de conocimiento

- [x] 1.1 RED: test — `PidKnowledgeEntry` con el campo `validated` (no `obdValidated`) falla a compilar/tipar en `pidKnowledgeMapper.test.ts` existente
- [x] 1.2 GREEN: renombrar `PidKnowledgeEntry.obdValidated` → `validated`; actualizar `toPidMetadata`/`toPidEntry` y `PIDS_TABLE_CONFIG` (columna `obdValidated` → `validated`)
- [x] 1.3 RED: test — `DtcKnowledgeEntry` con `validated: boolean` no compila (campo inexistente)
- [x] 1.4 GREEN: añadir `validated` a `DtcKnowledgeEntry`, `toDtcMetadata`/`toDtcEntry`, columna en `DTCS_TABLE_CONFIG`
- [x] 1.5 RED: test — `DiagnosisKnowledgeEntry` con `confidence`/`source` no compila
- [x] 1.6 GREEN: añadir `confidence: number` y `source: KnowledgeSource` a `DiagnosisKnowledgeEntry`, `toDiagnosisMetadata`/`toDiagnosisEntry`, columnas en `DIAGNOSES_TABLE_CONFIG`
- [x] 1.7 REFACTOR: con la suite en verde — revisar que los tres mappers sigan el mismo orden de campos (`id`, `embeddedText`, ..., `confidence`, `source`, `validated`); actualizar TSDoc de las tres interfaces explicando por qué `DiagnosisKnowledgeEntry` no tiene `validated` (referencia a `design.md` §1)

## 2. `confidenceScale.ts`

- [x] 2.1 RED: test — `initialConfidenceFor(KnowledgeSource.Web)` === 0.3, `.Mechanic` === 0.8, `.PreviousDiagnosis` === 0.5; función no existe todavía
- [x] 2.2 GREEN: crear `application/knowledge/confidenceScale.ts` con las constantes y `initialConfidenceFor(source)`
- [x] 2.3 RED: test — `validatedConfidenceFor(KnowledgeSource.Web)` === 0.7, `.Mechanic` === 0.9, cualquier otro `source` devuelve el mismo valor sin cambio
- [x] 2.4 GREEN: implementar `validatedConfidenceFor(source)`
- [x] 2.5 RED: test — `boostConfidence(0.9, 0.2)` satura en 1.0 (no 1.1); `boostConfidence(0.5, 0.2)` === 0.7
- [x] 2.6 GREEN: implementar `boostConfidence(current, bonus)` con `Math.min(1, current + bonus)`
- [x] 2.7 REFACTOR: con la suite en verde — constante `MAX_CONFIDENCE = 1` con nombre en vez de literal `1`; TSDoc explicando que `boostConfidence` para `PreviousDiagnosis` no se invoca todavía desde ningún flujo (documentado, no código muerto sin explicar)

## 3. `readPidRaw` en el puerto `ObdRepository`

- [x] 3.1 RED: test de contrato — `Elm327TcpRepository` no implementa `readPidRaw` (falla de tipado al asignar a `ObdRepository`)
- [x] 3.2 GREEN: añadir `readPidRaw(mode, pid, dataBytes): Promise<number[]>` a `ObdRepository`; implementar en `Elm327TcpRepository` reutilizando `client.sendCommand` + `parseModeResponse`/`parseMode22Response`, sin pasar por `pidFormulas.apply`
- [x] 3.3 RED: test — `Elm327TcpRepository.readPidRaw('22', '<pid-no-semilla>', 2)` devuelve los 2 bytes crudos de la respuesta simulada del transporte mockeado, sin aplicar ninguna fórmula
- [x] 3.4 RED: test — `ObdSimulatorRepository.readPidRaw('01', '0C', 2)` (PID soportado, RPM) devuelve bytes coherentes con el valor físico del escenario
- [x] 3.5 RED: test — `ObdSimulatorRepository.readPidRaw('22', '<pid-desconocido>', 2)` lanza `PidRawReadNotSupportedError`
- [x] 3.6 GREEN: implementar `readPidRaw` en `ObdSimulator`/`ObdSimulatorRepository`; crear `PidRawReadNotSupportedError` en `infrastructure/elm327/errors.ts` (reutilizable por ambos adaptadores, ya que el simulador no tiene su propio módulo de errores)
- [x] 3.7 REFACTOR: con la suite en verde — extraer el slice de bytes a `dataBytes` compartido entre `readPid` y `readPidRaw` en `Elm327TcpRepository` si hay duplicación real; verificar que ningún test de `read_pid` (tool MCP existente) se rompió por el cambio de firma del puerto

## 4. `ValidateDiscoveredPidUseCase`

- [x] 4.1 RED: test — con `obdRepo` mockeado devolviendo bytes que evalúan dentro de `[minValue, maxValue]`, `outcome === 'validated'`, `entry.validated === true`, `entry.confidence` sube según `validatedConfidenceFor(entry.source)`
- [x] 4.2 GREEN: implementar `ValidateDiscoveredPidUseCase.execute(entry, formula, range, obdRepo)`
- [x] 4.3 RED: test — bytes que evalúan fuera de rango, `outcome === 'out_of_range'`, entrada sin modificar
- [x] 4.4 RED: test — `obdRepo` `undefined`, `outcome === 'no_vehicle'`, sin excepción
- [x] 4.5 RED: test — `obdRepo.readPidRaw` rechaza con `PidRawReadNotSupportedError`, `outcome === 'unsupported'`, sin excepción propagada
- [x] 4.6 RED: test — `obdRepo.readPidRaw` rechaza con un error distinto (ej. `Elm327ConnectionError`), la excepción se propaga sin capturar
- [x] 4.7 GREEN: envolver la llamada en `try/catch` que solo intercepta `PidRawReadNotSupportedError`
- [x] 4.8 REFACTOR: con la suite en verde — extraer la comprobación de rango a una función pura `isWithinRange(value, min, max)` testeada aparte; TSDoc de `ValidateDiscoveredPidUseCase` documentando que no escribe en ningún índice (responsabilidad del llamador)

## 5. `ValidateDiscoveredDtcUseCase`

- [x] 5.1 RED: test — código presente en `readDtcCodes()`, `outcome === 'validated'`, `entry.validated === true`, confianza escalada
- [x] 5.2 GREEN: implementar `ValidateDiscoveredDtcUseCase.execute(entry, obdRepo)`
- [x] 5.3 RED: test — código ausente, `outcome === 'not_found'`, entrada sin modificar
- [x] 5.4 RED: test — `obdRepo` `undefined`, `outcome === 'no_vehicle'`, sin excepción
- [x] 5.5 GREEN: cubrir el caso `no_vehicle`
- [x] 5.6 REFACTOR: con la suite en verde — comparar con `ValidateDiscoveredPidUseCase` y extraer a un helper compartido solo si la duplicación es real (ambos ya divergen en la existencia de `'unsupported'`/`'out_of_range'`; si forzar un helper común complica más de lo que simplifica, se documenta la decisión de NO extraer)

## 6. Cierre

- [x] 6.1 Revisión transversal (NO sustituye a los REFACTOR de cada fase, que ya deben estar hechos): coherencia de nombres (`outcome`, `validated`, `confidence`) entre las tres fases de casos de uso y `@reviewer` sobre el diff completo
- [x] 6.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde
- [x] 6.3 `gga run` (o el hook de pre-commit configurado) en verde
- [x] 6.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [x] 6.5 Guardar resumen y decisiones no obvias en Engram
- [ ] 6.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen de cambios y esperar OK humano
