# ADR 007: Catálogo Auto-Expansivo con Búsqueda Vectorial (LanceDB)

**Estado:** Implementado
**Fecha:** 2026-07-26
**Actualizado:** 2026-08-18 — system prompt completado con DTC learning + catalog lookup proactivo. **Fuera de alcance por decisión**: el escalado por reutilización exitosa (`boostConfidence`, +0.2) depende de una señal de acierto que el sistema no tiene.
**Contexto:** El sistema debe aprender nuevos PIDs, DTCs y patrones de diagnóstico a medida que se conectan vehículos de distintos fabricantes.

---

## Contexto

Cada fabricante (Audi, Renault, Toyota, etc.) define sus propios PIDs propietarios (Mode 22) y DTCs específicos. Es imposible precargarlos todos. El sistema necesita:

- Descubrir PIDs/DTCs desconocidos durante un diagnóstico.
- Buscar información en internet o aceptar la aportación del mecánico.
- Validar que el PID/DTC existe realmente vía OBD.
- Recordar lo aprendido para futuros diagnósticos.
- Acumular casos de diagnóstico (problema → PIDs → solución) como memoria de taller.

## Decisión

Se adopta un **catálogo auto-expansivo** basado en búsqueda vectorial con los siguientes componentes:

### 1. Base de datos vectorial: LanceDB

- **Lancedb** — embedded, sin servidor, mismo paradigma que SQLite (un directorio en disco). Soporte nativo Node.js. Índice ANN vía IVF-PQ.
- Corre in-process, zero infraestructura. Evolución futura a pgvector o LanceDB Cloud si se necesita escalar.

### 2. Modelo de embeddings local

- **transformers.js** con el modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (~118 MB, 384 dimensiones, español + inglés).
- Sin API key, sin latencia de red, sin coste por embedding.
- Corre en CPU en el mismo proceso Node.js (~300 MB RAM).

### 3. Entidades indexadas (3 tablas en LanceDB)

| Tabla | Metadatos clave | Cuándo se indexa |
|---|---|---|
| `pids_index` | `manufacturer`, `model`, `confidence`, `source`, `validated` | PID nuevo descubierto y validado |
| `dtcs_index` | `manufacturer`, `model`, `confidence`, `source` | DTC nuevo descubierto y validado |
| `diagnoses_index` | `manufacturer`, `model`, `symptoms`, `pids_involved` | Diagnóstico completado con éxito |

Cada entrada se compone de `text` (texto para el embedding) + metadatos para filtrar.

### 4. Sistema de confianza

| Fuente | Confianza inicial | Tras validación OBD |
|---|---|---|
| **Web search** (LLM busca en internet) | 0.3 | 0.7 |
| **Mecánico** (aporta manualmente) | 0.8 | 0.9 |
| **Diagnóstico previo** (PID fue clave en un caso anterior) | 0.5 | +0.2 cada uso exitoso |

> **Nota (revisada 2026-08-18):** `boostConfidence` y `SUCCESSFUL_REUSE_BONUS = 0.2` están
> implementados y testeados como funciones puras, pero **no se invocan desde ningún flujo, y es
> deliberado**. El escalado por reutilización exitosa requiere saber que *el diagnóstico acertó*, y
> esa señal no existe ni puede inferirse: que un mecánico consulte un diagnóstico no significa que
> le sirviera. Fabricarla —dar por buena toda entrada reutilizada— degradaría el catálogo, porque
> subiría la confianza de aciertos y errores por igual.
>
> Obtenerla exige feedback explícito del mecánico (un "¿te ayudó este diagnóstico?" en la UI) y, con
> él, el bucle de producto que lo recoja y lo audite. Eso es un cambio de alcance, no una línea de
> código pendiente. Las funciones se conservan porque la política de confianza tiene un único dueño
> en `confidenceScale.ts` y ahí es donde el escalado deberá vivir el día que exista la señal; el
> TSDoc del propio módulo lo advierte para que nadie las cablee sin resolver antes el origen del
> dato.

La validación OBD usa la fórmula y el rango `[minValue, maxValue]` ya definidos en `PidDefinition`:
1. Leer el PID vía OBD (`readPid`).
2. Parsear el raw hex con la fórmula.
3. Si el valor cae dentro de `[minValue, maxValue]` → validado → subir confianza.
4. Si no → descartado o marcado como dudoso.

### 5. Web search como tool MCP

Cuando LanceDB no encuentra resultados para un PID/DTC desconocido, el LLM invoca la tool `web_search` para buscar en internet. La información obtenida se indexa con `confidence: 0.3` y queda pendiente de validación OBD.

### 6. Flujo de auto-aprendizaje

```
1. Vehículo nuevo (ej. Audi A3) → diagnóstico
2. LLM encuentra un PID/DTC desconocido
3. LLM busca en LanceDB → sin resultados o confianza baja
4. LLM invoca web_search → encuentra posible definición
5. LLM indexa el PID/DTC con confidence=0.3, source="web"
6. LLM valida vía readPid → parseo + rango
7. Si OK → confidence sube a 0.7, source="obd_validated"
8. Si no → descartado
9. Diagnóstico completado → se indexa el caso completo
```

### 7. MCP Tools nuevas

| Tool | Descripción |
|---|---|
| `search_similar_pids` | Busca PIDs por similitud semántica, opcionalmente filtrados por fabricante/modelo |
| `index_pid` | Indexa un PID nuevo (descubierto por web o aportado por mecánico) |
| `search_similar_dtcs` | Busca DTCs por similitud semántica |
| `index_dtc` | Indexa un DTC nuevo |
| `search_similar_diagnoses` | Busca diagnósticos pasados con síntomas similares |
| `index_diagnosis` | Guarda un caso de diagnóstico completado |
| `web_search` | Busca en internet información sobre un PID/DTC (LLM decide cuándo usarla) |

## Consecuencias

**Positivas:**

- El sistema aprende de cada vehículo que diagnostica. Cuantos más coches pasan, más inteligente se vuelve.
- Separación clara: SQLite/Postgres para datos relacionales, LanceDB para búsqueda semántica.
- Embeddings locales = cero coste operativo, ideal para demo del TFM.
- El sistema de confianza evita contaminar el catálogo con datos incorrectos.
- Demostrable en la defensa: muestras un Audi A3 que "enseña" sus PIDs al sistema y luego un segundo Audi A3 se beneficia.

**Negativas:**

- ~300 MB extra de RAM por transformers.js en el proceso Node.js.
- Primera ejecución: descarga de 118 MB del modelo (solo una vez, queda cacheado).
- La calidad de embeddings multilingües es inferior a modelos monolingües especializados.
- LanceDB en Node.js es relativamente nuevo — menos maduro que Chroma (Python) o pgvector (Postgres).
- El web scraping depende de disponibilidad de internet y calidad de resultados.

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **pgvector** (Postgres) | Requiere PostgreSQL corriendo; en desarrollo usamos SQLite, no encaja con el paradigma embedded actual |
| **Chroma** | Requiere Python runtime y servidor separado — rompe el "zero infraestructura" |
| **OpenAI embeddings** (`text-embedding-3-small`) | API key, coste por embedding, latencia de red — el modelo local es más adecuado para búsqueda interna |
| **Solo FTS5 de SQLite** (sin vectores) | No captura similitud semántica — "presión de aceite" no matchea con "oil pressure" ni con "lubricación motor" |

## Referencias

- ADR 002: `002-persistencia-de-datos.md` — SQLite + Drizzle ORM para datos relacionales
- ADR 003: `003-diagnostico-cognitivo-mcp.md` — MCP como protocolo de herramientas
- ADR 006: `006-llm-client-adapter.md` — Adaptador multi-proveedor LLM
- [LanceDB](https://lancedb.com/) — serverless vector database
- [transformers.js](https://huggingface.co/docs/transformers.js) — Hugging Face en Node.js
- `infrastructure/persistence/vector/` — directorio destino para la implementación
