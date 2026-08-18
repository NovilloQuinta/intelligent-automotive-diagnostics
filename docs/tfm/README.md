# Documentación técnica — TFM "Intelligent Automotive Diagnostics"

> Documentación generada para preparar la presentación ante el tribunal del TFM.
> Cada fichero documenta el funcionamiento **real** de una parte del proyecto
> (código en `develop`), con sección final de **discrepancias** entre la
> documentación existente (ADRs, OpenSpec, README) y lo que el código hace.

| Fichero | Parte | Contenido clave |
|---|---|---|
| [`01-mcp.md`](01-mcp.md) | Capa MCP | 16 tools MCP expuestas al LLM (7 diagnóstico OBD, 8 RAG, 1 web_search), ciclo de tool-calling, presupuesto web, errores |
| [`02-embeddings-rag.md`](02-embeddings-rag.md) | Embeddings + RAG | LanceDB, modelo `paraphrase-multilingual-MiniLM-L12-v2` (384 dims, local), colecciones `pids_index`/`dtcs_index`/`diagnoses_index`, pipeline indexación + búsqueda semántica |
| [`03-obd-elm327-emulador.md`](03-obd-elm327-emulador.md) | OBD-II / ELM327 / Emulador | 8 modos OBD soportados (01,02,03,04,07,09,0A,22), transportes TCP y Docker multi-escenario, simulador, PID formula catalog, SAE J1979 |
| [`04-diagnostico-cognitivo-llm.md`](04-diagnostico-cognitivo-llm.md) | Diagnóstico cognitivo LLM | Flujo completo HTTP→RAG→system prompt→tool-calling→parseo+enriquecimiento, providers Anthropic/OpenAI, confidence scale |
| [`05-arquitectura-core-api.md`](05-arquitectura-core-api.md) | Arquitectura core-api | Clean Architecture (domain/application/infrastructure), Express 5 + Drizzle + SQLite + Zod + JWT, 13 tablas, 31 endpoints, seguridad |
| [`06-ui-react.md`](06-ui-react.md) | UI React | React 19 + Vite + TanStack, 8 rutas, dashboard, MechanicChat, panel admin, wizard auto-detección vehículo |

## Discrepancias documentación–código: **resueltas** (2026-08-18)

> Estos documentos nacieron de una auditoría cuyo objetivo era encontrar dónde se había desviado la
> documentación del código. Encontró ocho desviaciones. **Todas están corregidas**; se listan aquí
> con su resolución porque el recorrido es parte del trabajo, no un anexo que ocultar.

| # | Desviación detectada | Resolución |
|---|---|---|
| 1 | ADR 002 documentaba PostgreSQL 17, motor dual por `DATABASE_URL` y 7 tablas inexistentes | ADR 002 reescrito: SQLite único (sin driver `pg` en el proyecto) y las 13 tablas reales. Se añade sección explicando **por qué** se descartó PostgreSQL |
| 2 | ADR 005 daba Mode 07 y 0A por no implementados | Corregido: ambos tienen método propio (`readPendingDtcCodes`, `readPermanentDtcCodes`) sobre `fetchDtcCodes(mode)`. Se documentan además `05`/`06` como permitidos sin parseo, y `08` como único servicio excluido —por seguridad, no por alcance |
| 3 | ADR 008 (ISO-TP) se leía como trabajo pendiente | Marcado explícitamente **no implementado y descartado**, con la razón: el chip ELM327 ya hace la segmentación y el flow control, así que la premisa del ADR era falsa |
| 4 | ADR 003 listaba 6 tools MCP | Actualizado a las **16** reales, agrupadas en diagnóstico (7), conocimiento (8) y web (1) |
| 5 | `boostConfidence` implementado y sin cablear | Reencuadrado en ADR 007 como **decisión de alcance**, no como olvido: exige una señal de "el diagnóstico acertó" que el sistema no tiene y que no puede inferirse sin degradar el catálogo |
| 6 | ADR 004: escenario por defecto `car` y ruta `elm327-simulator/` | Corregido: por defecto `run_audi.py` (Audi A3 TDI), tres emuladores en paralelo (Audi 35000, Kawasaki 35001, Toyota 35002) y el simulador propio en `infrastructure/simulation/`. Se añade nota de licencia CC-BY-NC-SA, ahora que la imagen sí se publica en GHCR |
| 7 | README describía funcionalidad inexistente | Alineado con lo entregado: wizard VIN, MechanicChat, historial, panel admin; se dice explícitamente que **no** hay exportación PDF ni búsqueda por matrícula. Tabla de endpoints completada |
| 8 | System prompt sin mencionar todas las tools | **Único punto abierto**: el prompt tiene bucles de aprendizaje para PIDs y DTCs pero no para ECUs, así que `get_ecu_info`, `search_similar_ecus` e `index_ecu` no se ejercitan. Ver `docs/deuda-conocida.md` |

Fuera de esa lista, la auditoría de seguridad de la misma fecha completó el **OWASP API Top 10 2023**
en `docs/security.md`, que solo cubría 4 de las 10 categorías.

## Cómo usar esto para la presentación

- **Vista general**: empieza por `05` (arquitectura) y `04` (flujo de IA).
- **Demo técnica**: `01` + `03` (MCP + OBD real con coche) y `02` (auto-aprendizaje).
- **Valor de negocio**: `06` (UX) + `02` (conocimiento que crece con cada diagnóstico).
