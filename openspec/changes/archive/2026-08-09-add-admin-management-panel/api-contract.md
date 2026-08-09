# Contrato HTTP — `/api/admin/*`

Generado a partir del código real (`AdminController.ts`, `admin.routes.ts`, los DTOs Zod de
`application/dto/admin/`, los casos de uso de `application/use-cases/admin/` y el test de
integración `tests/integration/admin.integration.test.ts`, cuyas respuestas se han volcado
literalmente aquí). Si este documento y el código divergen en el futuro, manda el código —
actualiza este fichero, no al revés.

## Convenciones comunes

- **Auth**: todas las rutas exigen `Authorization: Bearer <accessToken>` de un usuario con
  `role: 'admin'`.
- **Errores comunes a todas las rutas**:
  - `401 { "error": "Access token required" }` — sin token, token inválido/expirado, o el
    `userId` del token ya no corresponde a ningún usuario.
  - `403 { "error": "Admin role required" }` — usuario autenticado pero `role !== 'admin'`.
  - `429 { "error": "Too many requests, please try again later." }` — rate limit propio de
    `/api/admin` (por defecto 30 peticiones/minuto; configurable en `composition.ts`/
    `server.ts` vía `adminRateLimit`, independiente del de `/api/diagnosis` y `/api/auth`).
  - `500 { "error": "Internal server error" }` — error no esperado; nunca filtra el detalle
    interno.
- **Rutas `GET /api/admin/logs`, `/audit-logs`, `/users`**: `400` de validación tiene la
  forma `{ "error": "Validation failed", "details": ZodIssue[] }` (mismo formato que el resto
  de la API, `err.issues` de Zod).
- **Paginación**: envoltorio uniforme `{ "items": T[], "total": number }`. `total` es el
  número de filas que cumplen el filtro, no `items.length` (para poder calcular nº de
  páginas). `page` empieza en 1. `pageSize` tiene tope **100**: un `pageSize` mayor responde
  `400` (no se recorta).
- Las rutas propias de `/api/admin` **no generan entradas en `audit_logs`** (auto-exclusión
  en `createAuditLogger`, para no meter ruido recursivo al consultar el propio panel).

---

## `GET /api/admin/overview`

Sin query params.

**200** — forma exacta (`AdminOverview`):

```json
{
  "userStats": {
    "byUserType": { "individual": 2, "workshop": 1 },
    "byRole": { "user": 2, "admin": 1 }
  },
  "recentErrorCount": 0,
  "httpRequestsByPathApprox": {
    "/api/diagnosis": 2,
    "/api/auth/login": 10
  }
}
```

- `userStats.byUserType` / `byRole`: `Record<string, number>`. Las claves son los valores
  reales presentes en la tabla `users` (no hay lista cerrada garantizada por el tipo, aunque
  hoy solo existen `individual`/`workshop` y `user`/`admin`).
- `recentErrorCount`: `number`. Cuenta filas de `logs` con `level = 'error'` en las
  **últimas 24 horas** (ventana fija, no configurable por query param en este endpoint).
- `httpRequestsByPathApprox`: **`Record<string, number>` — APROXIMACIÓN.** Es un `GROUP BY
  path` de `audit_logs`, **de todo el histórico** (sin filtro de fecha), como proxy de
  tráfico HTTP. **No son diagnósticos reales**: no existe todavía una tabla que persista
  diagnósticos ni llamadas al LLM. No renderizar esto como "diagnósticos realizados" en la
  UI — usar una etiqueta como "peticiones HTTP a endpoints de diagnóstico".

---

## `GET /api/admin/logs`

Lista la tabla `logs` (todo nivel, incluido `debug`).

**Query params** (`AdminLogsFilter`, todos opcionales salvo lo indicado):

| Param | Tipo | Notas |
|---|---|---|
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | Rechaza cualquier otro valor con 400 |
| `from` | `string` (ISO 8601 datetime, `z.string().datetime()`) | — |
| `to` | `string` (ISO 8601 datetime) | 400 si `from > to` |
| `q` | `string`, 1–200 chars | Substring sobre `message` (`LIKE %q%`) |
| `page` | `integer > 0` | Default `1` |
| `pageSize` | `integer > 0`, máx `100` | Default `20`; >100 → 400 |

**200** — forma exacta:

```json
{
  "items": [
    {
      "id": 1,
      "level": "error",
      "message": "connection failed",
      "context": null,
      "createdAt": "2026-08-08T14:12:30.148Z"
    }
  ],
  "total": 1
}
```

- `context`: `string | null`. Es un JSON **serializado como string** (`Logger.saveToDb`
  hace `JSON.stringify(context)`), no un objeto anidado — si la UI quiere mostrarlo
  estructurado tiene que hacer `JSON.parse` ella misma, y manejar el caso `null`.
- Orden: descendente por `createdAt`.

---

## `GET /api/admin/audit-logs`

Lista la tabla `audit_logs`.

**Query params** (`AdminAuditFilter`):

| Param | Tipo | Notas |
|---|---|---|
| `statusCode` | `integer`, 100–599 | — |
| `path` | `string`, 1–500 chars | Igualdad exacta (`path = ...`), no substring |
| `userId` | `integer > 0` | — |
| `from` / `to` | `string` (ISO datetime) | 400 si `from > to` |
| `q` | `string`, 1–200 chars | Substring sobre `path` (`LIKE %q%`) — distinto de `path` exacto |
| `page` / `pageSize` | igual que en `/logs` | — |

**200** — forma exacta:

```json
{
  "items": [
    {
      "id": 2,
      "method": "GET",
      "path": "/api/diagnosis",
      "statusCode": 500,
      "ip": null,
      "userAgent": null,
      "durationMs": null,
      "userId": 1,
      "createdAt": "2026-08-08T14:12:30.148Z"
    }
  ],
  "total": 2
}
```

- `ip`, `userAgent`, `durationMs`, `userId`: siempre presentes en el JSON, con valor `null`
  cuando no aplican (nunca se omiten).
- Orden: descendente por `createdAt`.

---

## `GET /api/admin/users`

Lista la tabla `users`. **Nunca incluye `passwordHash`** (misma proyección que
`toSafeUser`/`GET /api/auth/me`).

**Query params** (`AdminUsersFilter`): solo hereda del filtro base — `q`, `from`, `to`,
`page`, `pageSize`. `q` filtra por `email OR username` (substring, `LIKE %q%`). `from`/`to`
filtran por `createdAt` (fecha de registro).

**200** — forma exacta:

```json
{
  "items": [
    {
      "id": 2,
      "username": "admin",
      "email": "admin@test.com",
      "userType": "individual",
      "role": "admin",
      "businessName": null,
      "taxId": null,
      "address": null,
      "createdAt": "2026-08-08T14:12:30.128Z",
      "failedLoginAttempts": 0,
      "lockedUntil": null,
      "isWorkshop": false,
      "isAdmin": true
    }
  ],
  "total": 2
}
```

- `email` es un **string plano** en el JSON (el value object `Email` serializa a string via
  `toJSON()`), no `{ value: string }`.
- `userType`: `'individual' | 'workshop'`. `role`: `'user' | 'admin'`. `isWorkshop`/`isAdmin`
  son booleanos derivados, calculados por el backend — la UI no necesita reimplementar esa
  lógica a partir de `userType`/`role`.
- `businessName`, `taxId`, `address`, `lockedUntil`: `string | null`.
- Orden: descendente por `createdAt` (fecha de registro).

---

## `GET /api/admin/knowledge`

Conteo y muestra de los tres índices vectoriales (`pids_index`, `dtcs_index`,
`diagnoses_index`). Sin query params. **No genera ningún embedding.**

**200** — forma exacta:

```json
{
  "pids": { "count": 10, "sample": [{ "id": "pid-1" }] },
  "dtcs": { "count": 5, "sample": [{ "id": "dtc-1" }] },
  "diagnoses": { "count": 2, "sample": [{ "id": "diag-1" }] }
}
```

- Las tres claves (`pids`, `dtcs`, `diagnoses`) siempre están presentes cuando el endpoint
  responde 200.
- `count`: `number`.
- `sample`: `Record<string, unknown>[]`, **hasta 5 filas por índice** (límite fijo definido
  en el composition root, no configurable por query param en este endpoint), **sin orden
  por relevancia** — es "unas cuantas filas para ver qué hay", no una búsqueda semántica. La
  forma real de cada fila depende del índice: son los **metadatos crudos** guardados junto
  al vector (no pasan por el mapeador `fromMetadata` que reconstruye la entidad de dominio,
  a diferencia de `POST /knowledge/search` — ver más abajo), así que pueden incluir
  cualquier campo de metadata que el índice tenga (`id`, `manufacturer`, `model`,
  `confidence`, `source`, `validated`, `symptoms`, `pidsInvolved`, `embeddedText`... según el
  índice). No asumir un shape fijo desde la UI; tratar cada fila como `Record<string,
  unknown>` y renderizar lo que haya.
- **`503 { "error": "Knowledge stack is not available" }`** — cuando LanceDB no está
  disponible (p. ej. el modelo de embeddings falló al cargar en el arranque); en ese caso
  `GET /api/admin/knowledge` y `POST /api/admin/knowledge/search` responden 503 en vez de
  200/400. La UI debe manejar este caso como "catálogo no disponible", no como error genérico.

---

## `POST /api/admin/knowledge/search`

Búsqueda de prueba contra el catálogo vectorial: usa el mismo flujo `embed()` +
`VectorStore.query()` que el RAG real (vía `KnowledgeStack.pidsIndex/dtcsIndex/
diagnosisIndex.search()`), así que el resultado es representativo de lo que devolvería un
diagnóstico real para ese texto — a diferencia de `sample()` en `GET /knowledge`.

**Body** (`KnowledgeSearchInput`, JSON):

| Campo | Tipo | Notas |
|---|---|---|
| `text` | `string`, 1–500 chars, requerido | Texto a embeber y buscar |
| `index` | `'pids' \| 'dtcs' \| 'diagnoses'`, requerido | Cualquier otro valor → 400 |
| `limit` | `integer`, 1–20 | Default `5` |

**200** — forma exacta:

```json
{
  "results": [
    { "entry": { "id": "pid-1" }, "distance": 0.1 }
  ]
}
```

- `results`: array ordenado de **menor a mayor `distance`** (más parecido primero).
- `entry`: a diferencia de `sample()`, esta es la entidad **reconstruida** vía
  `fromMetadata` — su forma exacta depende de `index`:
  - `index: "pids"` → `PidKnowledgeEntry`: `{ id: string, embeddedText: string, manufacturer: string, model: string, confidence: number, source: string, validated: boolean }`
  - `index: "dtcs"` → `DtcKnowledgeEntry`: mismo shape que `PidKnowledgeEntry`.
  - `index: "diagnoses"` → `DiagnosisKnowledgeEntry`: `{ id: string, embeddedText: string, manufacturer: string, model: string, symptoms: string[], pidsInvolved: string[], confidence: number, source: string }` (sin `validated`).
- `distance`: `number` (0 = idéntico; sin cota superior definida por el motor).
- **400** también cuando el body no es JSON válido o falta `text`/`index`.
- **503** — igual que en `GET /knowledge`, cuando el catálogo vectorial no está disponible.

---

## Cambio relacionado en `GET /api/auth/me` (no es `/api/admin`, pero la UI lo necesita para decidir si mostrar el panel)

`GetCurrentUserUseCase`/`AuthController.me` ya devuelven `role` e `isAdmin` (sin cambios de
código adicionales: fluye automáticamente por `toSafeUser`). Forma relevante añadida:

```json
{
  "id": 1,
  "username": "juan",
  "email": "juan@test.com",
  "userType": "individual",
  "role": "user",
  "isWorkshop": false,
  "isAdmin": false,
  "...": "resto de campos de UserProfile sin cambios"
}
```

La UI debe mostrar el enlace a `/admin` (y permitir navegar a esa sección) únicamente cuando
`isAdmin === true` (equivalente a `role === 'admin'`).
