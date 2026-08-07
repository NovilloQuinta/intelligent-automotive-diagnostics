## 0. Preparación

- [ ] 0.1 Confirmar que `add-knowledge-mcp-tools` (y transitivamente los dos bloques anteriores) están mergeados a `develop`; crear `feat/web-search-tool`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, anotar nº de tests
- [ ] 0.3 Cargar contexto: ADR-007 §5, este `proposal.md`/`design.md`, `mcpServer.ts` tras `add-knowledge-mcp-tools`, `rate-limiter.middleware.ts` (para contrastar por qué no se reutiliza), Brave Search API docs (forma de la respuesta)

## 1. `WebSearchPort` + DTO

- [ ] 1.1 RED: test — un adaptador fake que implementa `WebSearchPort` no compila porque el puerto no existe
- [ ] 1.2 GREEN: crear `application/ports/WebSearchPort.ts` y `application/dto/web-search/WebSearchResult.ts`
- [ ] 1.3 REFACTOR: con la suite en verde — TSDoc del puerto explicando por qué no expone parámetros de idioma/región (decisión de diseño, no olvido)

## 2. Adaptador Brave Search

- [ ] 2.1 RED: test — `createBraveSearchClient({ apiKey }).search(query)` con `fetch` mockeado devolviendo una respuesta válida de Brave, mapea a `WebSearchResult[]`
- [ ] 2.2 GREEN: implementar `braveSearchClient.ts` con `parseBraveSearchResponse` validado por Zod
- [ ] 2.3 RED: test — respuesta HTTP no-OK (ej. 401, 429) lanza `WebSearchProviderError` con el status
- [ ] 2.4 GREEN: implementar el chequeo `res.ok` y el error tipado
- [ ] 2.5 RED: test — un resultado individual de la respuesta que no cumple el esquema Zod mínimo (falta `title`/`url`) se descarta sin invalidar el resto de resultados
- [ ] 2.6 GREEN: `parseBraveSearchResponse` filtra en vez de fallar ante un elemento malformado
- [ ] 2.7 REFACTOR: con la suite en verde — extraer la URL base y el conteo de resultados a constantes con nombre; verificar que ningún log incluye la API key

## 3. Saneado de contenido (delimitadores, truncado, control chars)

- [ ] 3.1 RED: test — `wrapUntrustedResult(snippet)` envuelve el snippet en `<untrusted-web-result>...</untrusted-web-result>`
- [ ] 3.2 GREEN: implementar `wrapUntrustedResult`
- [ ] 3.3 RED: test — un snippet de 800 caracteres se trunca a `MAX_SNIPPET_LENGTH` (500) antes de envolverse
- [ ] 3.4 RED: test — un snippet que contiene literalmente `</untrusted-web-result>` lo tiene eliminado en el resultado final
- [ ] 3.5 RED: test — un snippet con caracteres de control (`\x00`-`\x1F` salvo `\n`) los tiene eliminados
- [ ] 3.6 GREEN: implementar truncado + eliminación de la cadena de escape + limpieza de caracteres de control, en ese orden, dentro de `wrapUntrustedResult`
- [ ] 3.7 REFACTOR: con la suite en verde — extraer cada paso de saneado a una función pura nombrada (`truncate`, `stripDelimiterEscape`, `stripControlChars`) compuestas en `wrapUntrustedResult`; test dedicado por función

## 4. Presupuesto de llamadas (`webSearchBudget.ts`)

- [ ] 4.1 RED: test — `createWebSearchBudget(3).tryConsume()` devuelve `true` las primeras 3 veces y `false` a partir de la cuarta
- [ ] 4.2 GREEN: implementar `createWebSearchBudget`
- [ ] 4.3 RED: test — dos instancias de `createWebSearchBudget` no comparten estado entre sí
- [ ] 4.4 REFACTOR: con la suite en verde — constante `MAX_WEB_SEARCHES_PER_SESSION` con nombre, TSDoc explicando el ciclo de vida (una instancia por `createMcpServer`, no compartida)

## 5. Tool `web_search` en `mcpServer.ts`

- [ ] 5.1 RED: test — `createMcpServer(repo, undefined, undefined, webSearchMock)` incluye `web_search` en `listTools()`
- [ ] 5.2 GREEN: `createMcpServer` gana el cuarto parámetro `webSearch?: WebSearchPort`; `registerWebSearchTool(register, webSearch, budget)` se registra solo si `webSearch` está definido, con un `budget = createWebSearchBudget()` creado dentro de `createMcpServer` (uno por servidor, coherente con Decisión 3)
- [ ] 5.3 RED: test — sin `webSearch`, `listTools()` no incluye `web_search`
- [ ] 5.4 RED: test — con `webSearch` mockeado devolviendo resultados, el texto de respuesta contiene los delimitadores y respeta `MAX_WEB_SEARCH_RESULTS`
- [ ] 5.5 GREEN: implementar `handleWebSearch(webSearch, budget)` usando `wrapUntrustedResult` de la fase 3
- [ ] 5.6 RED: test — cuarta invocación en la misma sesión (`budget` agotado) devuelve `isError: true` con categoría `client_error`, sin invocar `webSearch.search`
- [ ] 5.7 GREEN: comprobar `budget.tryConsume()` antes de llamar al puerto
- [ ] 5.8 RED: test — `webSearch.search` rechaza con `WebSearchProviderError`, el resultado se categoriza `external_error` (extender `categorizeError`)
- [ ] 5.9 GREEN: añadir el caso a `categorizeError`
- [ ] 5.10 REFACTOR: con la suite en verde — revisar que `registerWebSearchTool` siga el mismo estilo que `registerKnowledgeTools`/`registerDiagnosticTools`; TSDoc de por qué el presupuesto vive dentro de `createMcpServer` y no en `composition.ts`

## 6. Configuración y wiring

- [ ] 6.1 RED: test — `loadConfig()` acepta `WEB_SEARCH_API_KEY` opcional sin romper el resto del schema
- [ ] 6.2 GREEN: añadir `WEB_SEARCH_API_KEY: z.string().optional()` a `configSchema`
- [ ] 6.3 RED: test — `createWebSearchPort(config)` devuelve `undefined` si `WEB_SEARCH_API_KEY` no está definida, y un `WebSearchPort` si lo está
- [ ] 6.4 GREEN: implementar `createWebSearchPort` en `composition.ts`
- [ ] 6.5 RED: test — `DiagnosisServiceOptions` acepta `webSearch?: WebSearchPort`; `cognitiveDiagnosis()` y `callMcpTool()` lo pasan a `createMcpServer`
- [ ] 6.6 GREEN: propagar `webSearch` en `diagnosisService.ts`
- [ ] 6.7 REFACTOR: con la suite en verde — `grep` para confirmar que `WEB_SEARCH_API_KEY` no aparece en ningún `logger.info`/`logger.warn`/mensaje de error

## 7. Prompt de sistema: contenido no confiable

- [ ] 7.1 RED: test — `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` incluye la línea sobre `<untrusted-web-result>` como dato, no instrucción
- [ ] 7.2 GREEN: añadir la línea al array de `ExecuteCognitiveDiagnosisUseCase.ts`
- [ ] 7.3 REFACTOR: con la suite en verde — revisar que el prompt siga siendo legible como lista de bullets, sin duplicar información ya presente

## 8. Integración de extremo a extremo

- [ ] 8.1 Test de integración: `DiagnosisService.cognitiveDiagnosis` con `webSearch` mockeado y un LLM fake que invoca `web_search` y luego `index_pid` (de `add-knowledge-mcp-tools`) con los datos obtenidos — verificar que la entrada indexada queda con `source: Web`, `confidence: 0.3`, `validated: false`
- [ ] 8.2 Verificar con `grep` que ningún fichero de `application/` importa `fetch`, Brave, o cualquier detalle de `infrastructure/web-search/`

## 9. Cierre

- [ ] 9.1 Revisión transversal (NO sustituye a los REFACTOR de cada fase, que ya deben estar hechos): checklist de seguridad del `design.md` (delimitadores, truncado, presupuesto, ausencia de la tool sin key) y `@security` sobre el diff completo, dado que toca `infrastructure/` con una llamada HTTP saliente nueva
- [ ] 9.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde
- [ ] 9.3 `gga run` (o el hook de pre-commit configurado) en verde
- [ ] 9.4 Actualizar `SESION ACTUAL` en `AGENTS.md` (cierra el plan RAG del ADR-007: marcar el ADR como "Implementado" si los 4 bloques ya están mergeados)
- [ ] 9.5 Guardar resumen y decisiones no obvias en Engram
- [ ] 9.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen de cambios y esperar OK humano
