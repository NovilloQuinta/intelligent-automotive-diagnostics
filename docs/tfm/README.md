# Documentación técnica — TFM "Intelligent Automotive Diagnostics"

> Documentación generada para preparar la presentación ante el tribunal del TFM.
> Cada fichero documenta el funcionamiento **real** de una parte del proyecto
> (código en `develop`), con sección final de **discrepancias** entre la
> documentación existente (ADRs, OpenSpec, README) y lo que el código hace.

| Fichero | Parte | Contenido clave |
|---|---|---|
| [`01-mcp.md`](01-mcp.md) | Capa MCP | 14 tools MCP expuestas al LLM (7 diagnóstico OBD, 6 RAG, 1 web_search), ciclo de tool-calling, presupuesto web, errores |
| [`02-embeddings-rag.md`](02-embeddings-rag.md) | Embeddings + RAG | LanceDB, modelo `paraphrase-multilingual-MiniLM-L12-v2` (384 dims, local), colecciones `pids_index`/`dtcs_index`/`diagnoses_index`, pipeline indexación + búsqueda semántica |
| [`03-obd-elm327-emulador.md`](03-obd-elm327-emulador.md) | OBD-II / ELM327 / Emulador | 8 modos OBD soportados (01,02,03,04,07,09,0A,22), transportes TCP y Docker multi-escenario, simulador, PID formula catalog, SAE J1979 |
| [`04-diagnostico-cognitivo-llm.md`](04-diagnostico-cognitivo-llm.md) | Diagnóstico cognitivo LLM | Flujo completo HTTP→RAG→system prompt→tool-calling→parseo+enriquecimiento, providers Anthropic/OpenAI, confidence scale |
| [`05-arquitectura-core-api.md`](05-arquitectura-core-api.md) | Arquitectura core-api | Clean Architecture (domain/application/infrastructure), Express 5 + Drizzle + SQLite + Zod + JWT, 10 tablas, 22 endpoints, seguridad |
| [`06-ui-react.md`](06-ui-react.md) | UI React | React 19 + Vite + TanStack, 8 rutas, dashboard, MechanicChat, panel admin, wizard auto-detección vehículo |

## Discrepancias críticas detectadas (resumen)

> Detalle completo en la sección "Discrepancias detectadas" de cada fichero.

1. **ADR 002 desactualizado**: documenta PostgreSQL y 7 tablas (workspaces,
   diagnostic_results, ...) que **no existen**. El código real usa **SQLite**
   (better-sqlite3, WAL) con 10 tablas distintas (`vehicles`, `ecus`,
   `pid_definitions`, `pid_readings`, `diagnosis_sessions`, `users`,
   `refresh_tokens`, `audit_logs`, `logs`). → *Archivo 05*.
2. **ADR 005 desactualizado**: dice que Mode 07 y 0A no están implementados,
   pero el código **sí** los implementa. → *Archivo 03*.
3. **ADR 008 (ISO-TP) es solo propuesta**: no hay implementación ni tests.
   → *Archivo 03*.
4. **MCP**: ADR 003 lista 6 tools; el código expone **14** (incluye
   `get_ecu_info` y todas las RAG + web_search). → *Archivo 01*.
5. **`boostConfidence`** implementado pero **no cableado** a ningún flujo
   (ya reconocido en ADR 007). → *Archivos 01, 02, 04*.
6. **Emulador Docker**: ADR 004 dice escenario por defecto `car` (Toyota),
   el Dockerfile usa `audi-a3-tdi`; el directorio `elm327-simulator/` del ADR
   no existe (el simulador está en `infrastructure/simulation/`). → *Archivo 03*.
7. **UI vs README**: el README describe selector de vehículos, informes PDF e
   historial por matrícula — en el código real hay wizard VIN de 3 pasos y **no
   existe** exportación PDF ni historial por matrícula (usa VIN). → *Archivo 06*.
8. **System prompt del LLM** no menciona `get_ecu_info` ni `index_diagnosis`
   aunque están registradas como tools. → *Archivo 04*.

## Cómo usar esto para la presentación

- **Vista general**: empieza por `05` (arquitectura) y `04` (flujo de IA).
- **Demo técnica**: `01` + `03` (MCP + OBD real con coche) y `02` (auto-aprendizaje).
- **Valor de negocio**: `06` (UX) + `02` (conocimiento que crece con cada diagnóstico).
