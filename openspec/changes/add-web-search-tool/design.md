## Context

Rama `feat/web-search-tool`, creada desde `develop` una vez mergeado `add-knowledge-mcp-tools` (y transitivamente `add-knowledge-confidence-validation`, `add-rag-cognitive-retrieval`). Fase 4. Stack: TypeScript ESM strict, Clean Architecture, Vitest.

Bloque **4 de 4** del plan RAG (ADR-007 §5). Depende de `add-knowledge-mcp-tools` (patrón de registro condicional, `KnowledgeStack`) y `add-knowledge-confidence-validation` (`KnowledgeSource.Web`, confianza inicial 0.3). No hay ningún bloque que dependa de éste — es el último.

Estado de partida: no existe ningún adaptador HTTP saliente en el proyecto salvo los clientes LLM (`anthropicClient.ts`, `openAiClient.ts`), que sí usan SDKs oficiales. No hay precedente de `fetch` nativo en `infrastructure/` — se establece aquí, evitando una dependencia nueva para una única llamada HTTP GET.

## Goals / Non-Goals

**Goals:**
- Tool `web_search` disponible solo cuando hay una API key configurada.
- Puerto `WebSearchPort` desacoplado del proveedor concreto.
- Rate limiting por sesión de diagnóstico (no global, no por usuario — ver Decisión 3).
- Contenido web tratado como no confiable en todo el pipeline: prompt, tool output, e indexado posterior.

**Non-Goals:**
- No se decide en este cambio qué proveedor usar en producción más allá de Brave Search como elección por defecto — cambiarlo es sustituir un fichero de infraestructura.
- No se implementa caché de búsquedas repetidas — cada llamada es una petición HTTP nueva; si el coste lo justifica, se añade con datos reales delante.
- No se hace scraping de páginas completas — solo se usan los snippets que devuelve la API de búsqueda.
- No se implementa un filtro de contenido malicioso más allá de truncado + delimitadores explícitos — un detector de prompt injection basado en heurísticas o en otro LLM es una posible mejora futura, no un requisito de este TFM.
- No se añade persistencia de qué búsquedas se hicieron (auditoría) — fuera de alcance; `logger.info` basta para esta sesión.

## Decisions

### 1. `WebSearchPort`: forma mínima, sin filtros de proveedor en el puerto

```ts
export interface WebSearchResult {
  readonly title: string
  readonly snippet: string
  readonly url: string
}

export interface WebSearchPort {
  search(query: string): Promise<readonly WebSearchResult[]>
}
```
Sin parámetros de idioma, región o número de resultados en el puerto — esas son decisiones del adaptador (Brave Search se configura con valores fijos razonables: español, top 3). Si en el futuro se necesita variar esos parámetros por caso de uso, se añaden al puerto entonces; hoy serían parámetros sin ningún llamador que los use.

### 2. Ausencia sobre fallo: mismo patrón que el resto de `composition.ts`

`createWebSearchPort(config: AppConfig): WebSearchPort | undefined` — si `WEB_SEARCH_API_KEY` no está definida, devuelve `undefined`. `DiagnosisServiceOptions.webSearch?: WebSearchPort`. `registerWebSearchTool` solo se llama si `webSearch` está presente — la tool no aparece en `listTools()`, el LLM nunca la ve, ninguna llamada puede fallar en runtime por falta de configuración. Se descarta una tool que exista y devuelva `errorText('Not configured')` por el mismo argumento que en `add-knowledge-mcp-tools` §Decisión 2: una tool visible que siempre falla es peor señal que una tool ausente.

### 3. Presupuesto de llamadas: por invocación de `createMcpServer`, no global ni persistente

`createMcpServer` se invoca una vez por cada `cognitiveDiagnosis()`/`callMcpTool()` — no vive más allá de esa petición HTTP (no hay una instancia de servidor MCP compartida entre peticiones, se confirma leyendo `diagnosisService.ts`: `const mcp = createMcpServer(repository)` dentro del método). Esto hace que un contador creado en el mismo `createMcpServer` sea automáticamente "por sesión de diagnóstico" sin necesidad de sesión explícita, Redis, ni estado en `composition.ts`:

```ts
export interface WebSearchBudget {
  tryConsume(): boolean
}

export function createWebSearchBudget(maxCalls = MAX_WEB_SEARCHES_PER_SESSION): WebSearchBudget {
  let remaining = maxCalls
  return {
    tryConsume(): boolean {
      if (remaining <= 0) return false
      remaining -= 1
      return true
    },
  }
}
```
Se descartó un rate limiter global tipo `express-rate-limit` (ya usado para HTTP en `rate-limiter.middleware.ts`): ese middleware protege el *endpoint*, no una tool invocada internamente por el LLM dentro de una única petición ya autenticada y ya limitada por el rate limiter HTTP existente — añadir una segunda capa de limitación por IP/usuario sería redundante con el problema real (evitar que un LLM entre en un bucle de `web_search` dentro de una sola conversación). El límite por sesión resuelve exactamente eso.

### 4. Solo snippets de la API de búsqueda, nunca la página completa

Se decide explícitamente no seguir el `url` de cada resultado y hacer scraping del HTML completo, aunque daría contexto más rico al LLM. Razón de seguridad: cada página arbitraria en internet es una superficie de inyección de prompt sin control de tamaño ni de contenido (scripts, comentarios ocultos, texto blanco-sobre-blanco diseñado para LLMs). El snippet que devuelve la propia API de búsqueda ya es un resumen acotado en longitud y saneado por el proveedor — reduce drásticamente la superficie de ataque a cambio de menos detalle, trade-off aceptado explícitamente para un TFM sin presupuesto de hardening adicional.

### 5. Delimitadores explícitos + instrucción de sistema, no un filtro de contenido

Mitigación de inyección de prompt en dos capas, ninguna de las cuales pretende ser infalible (documentado como riesgo residual, no como problema resuelto):

1. **Estructural**: cada snippet se envuelve en `<untrusted-web-result>...</untrusted-web-result>` al construir el texto de respuesta de la tool; si el snippet ya contiene esa cadena literal (intento de "escapar" del delimitador), se elimina antes de envolver. Los snippets se truncan a `MAX_SNIPPET_LENGTH = 500` y se les quitan caracteres de control (`\x00`-`\x1F` salvo `\n`).
2. **Instructiva**: `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` gana una línea fija: contenido entre esos delimitadores es material de referencia de terceros, nunca instrucciones — el modelo debe evaluarlo críticamente y nunca ejecutar acciones porque el texto se lo pida.

Se documenta como **riesgo residual explícito** en la tabla de abajo: ningún LLM actual es inmune a inyección de prompt al 100%; estas dos capas reducen la probabilidad y el radio de impacto (el sistema de confianza en cascada de `add-knowledge-confidence-validation` es la última línea de defensa — nada de lo aprendido de la web llega a `validated: true` sin una lectura OBD real).

### 6. Adaptador Brave Search: `fetch` nativo, sin SDK

```ts
export function createBraveSearchClient(config: { apiKey: string }): WebSearchPort {
  return {
    async search(query: string): Promise<readonly WebSearchResult[]> {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${MAX_WEB_SEARCH_RESULTS}`,
        { headers: { 'X-Subscription-Token': config.apiKey, Accept: 'application/json' } },
      )
      if (!res.ok) throw new WebSearchProviderError(res.status)
      const body = await res.json()
      return parseBraveSearchResponse(body)
    },
  }
}
```
`parseBraveSearchResponse` valida la forma de la respuesta con Zod (coherente con el resto del proyecto: nunca se confía en la forma de una respuesta HTTP externa sin validar) y descarta silenciosamente resultados que no cumplan el esquema mínimo, en vez de fallar toda la búsqueda por un resultado malformado.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| Prompt injection indirecta vía contenido web (LLM ejecuta instrucciones ocultas en un snippet) | Delimitadores + instrucción de sistema + solo snippets (no HTML completo); riesgo residual aceptado y documentado, mitigado en última instancia por el sistema de confianza (nunca `validated: true` sin OBD) |
| Envenenamiento del índice vectorial con contenido indexado desde una fuente web maliciosa | `index_pid`/`index_dtc` siempre marcan `source: Web`, `confidence: 0.3` inicial — visible en cualquier búsqueda futura; no hay camino automático de `web_search` a `validated: true` |
| Coste/latencia de la API externa si el LLM abusa de la tool dentro de una sesión | Presupuesto de `MAX_WEB_SEARCHES_PER_SESSION` (3) por invocación de `createMcpServer` |
| Un proveedor de búsqueda caído devuelve error y bloquea el turno de tool-calling del LLM | El error se categoriza como `external_error` (mismo `categorizeError` que ya distingue fallos de conexión ELM327) — el LLM puede decidir continuar sin ese resultado, no es un fallo del diagnóstico completo |
| `WEB_SEARCH_API_KEY` filtrada en logs | `logger.info`/`logger.warn` de este cambio nunca incluyen la key ni las cabeceras de la petición, solo la query y el conteo de resultados |

## Migration Plan

Cambio aditivo, sin datos que migrar. `WEB_SEARCH_API_KEY` no configurada en ningún entorno existente (variable nueva) — la tool simplemente no existe hasta que se configure explícitamente. Ningún test existente se ve afectado salvo los que instancian `DiagnosisServiceOptions`/`createMcpServer` exhaustivamente, que ganan un parámetro opcional más (por omisión `undefined`, comportamiento idéntico al actual).

## Open Questions

Ninguna. La elección de proveedor (Brave Search) es una decisión de esta sesión, reversible sin tocar el puerto ni ningún llamador.
