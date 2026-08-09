# 6. Aplicación de Interfaz de Usuario (UI)

> Documentación detallada de la SPA de diagnóstico vehicular.
> Basada en el código real de `apps/ui/` a fecha de agosto 2026.

---

## 6.1 Stack tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| React | 19.2 | Librería de componentes |
| Vite | 6.x | Bundler y servidor de desarrollo |
| TanStack Router | 1.170 | Enrutador basado en sistema de ficheros |
| TanStack React Query | 5.101 | Gestión de estado asíncrono y caché |
| TanStack React Start | 1.168 | Framework SSR (usado como SPA con middleware mínimo) |
| TailwindCSS | 4.x | Utilidades CSS atómicas |
| shadcn/ui (Radix UI) | — | Primitivas accesibles (accordion, tabs, select, alert-dialog, etc.) |
| react-hook-form | 7.71 | Gestión de formularios |
| Zod | 3.24 | Validación de esquemas (formularios + DTOs) |
| react-markdown | 10.1 | Renderizado de Markdown (respuestas del LLM) |
| sonner | 2.0 | Notificaciones toast |
| lucide-react | 0.575 | Iconografía |

**Toolchain**: TypeScript 5.7 estricto · ESLint 9 + Prettier · Vitest 3 · Playwright para tests e2e.

---

## 6.2 Estructura del código fuente

```
apps/ui/src/
├── main.tsx                    ← Entry point SPA (mount React + router)
├── start.ts                    ← Middleware de servidor TanStack Start (mínimo)
├── server.ts                   ← Configuración SSR (no usada en SPA pura)
├── router.tsx                  ← Factory de router con QueryClient
├── routeTree.gen.ts            ← Árbol de rutas autogenerado por TanStack Router
├── styles.css                  ← Tema global oscuro + animaciones CSS custom
│
├── routes/                     ← Páginas (file-based routing)
│   ├── __root.tsx              ← Layout raíz: QueryClientProvider + AuthProvider + Toaster
│   ├── index.tsx               ← Landing (anónimo) o Dashboard (autenticado)
│   ├── login.tsx               ← Login + Registro con tabs y Zod
│   ├── admin.tsx               ← Layout admin con sidebar lateral
│   ├── admin.index.tsx         ← Panel Overview (tarjetas de estadísticas)
│   ├── admin.users.tsx         ← Tabla de usuarios
│   ├── admin.logs.tsx          ← Tabla de logs del sistema
│   ├── admin.audit.tsx         ← Tabla de auditoría HTTP
│   └── admin.knowledge.tsx     ← Panel de búsqueda semántica en catálogos
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx         ← Sidebar izquierdo con 8 secciones + badge DTC
│   │   └── DashboardLayout.tsx ← Shell del dashboard: TopBar + Sidebar + contenido
│   ├── landing/
│   │   └── LandingPage.tsx     ← Página de marketing para visitantes anónimos
│   ├── dashboard/              ← Componentes + hooks del panel de diagnóstico
│   │   ├── DashboardPage.tsx   ← Orquestador principal del dashboard
│   │   ├── DashboardSection.tsx← Switch de secciones del sidebar
│   │   ├── TopBar.tsx          ← Barra superior (logo, selector vehículo, admin, logout)
│   │   ├── TelemetrySection.tsx← Sección de telemetría en vivo con 4 gauges
│   │   ├── DiagnoseButton.tsx  ← Botón "Iniciar diagnóstico" con animación
│   │   ├── DiagnosisPanel.tsx  ← Resultado del diagnóstico determinista
│   │   ├── MechanicChat.tsx    ← Chat con el LLM (mecánico IA)
│   │   ├── DtcPanel.tsx        ← Panel de códigos DTC (3 tabs + borrar)
│   │   ├── FreezeFramePanel.tsx← Tabla de freeze frame del DTC seleccionado
│   │   ├── EcuInfoPanel.tsx    ← Tabla de ECUs descubiertas
│   │   ├── VehicleStatusPanel.tsx ← Estado MIL, monitores de emisiones
│   │   ├── SessionReportPanel.tsx ← Informe consolidado de sesión
│   │   ├── PidsTable.tsx       ← Tabla de PIDs (fijos + descubiertos por IA)
│   │   ├── RpmGauge.tsx        ← Tacómetro circular SVG
│   │   ├── CoolantBar.tsx      ← Barra vertical de temperatura refrigerante
│   │   ├── SpeedDisplay.tsx    ← Velocímetro digital
│   │   ├── IntakeThermo.tsx    ← Termómetro de admisión
│   │   ├── VehicleSelector.tsx ← Selector de escenario/vehículo
│   │   ├── VehicleAutoDetectWizard.tsx ← Wizard de identificación VIN (3 pasos)
│   │   ├── types.ts            ← Tipos compartidos del dominio de UI
│   │   ├── pidCatalog.ts       ← Catálogo y merge de PIDs fijos + IA
│   │   ├── severityMeta.ts     ← Metadatos visuales de severidad (colores, iconos)
│   │   └── use*.ts             ← 14 hooks de datos (ver §6.5)
│   └── admin/                  ← Componentes del panel de administración
│       ├── OverviewCards.tsx   ← Tarjetas de estadísticas (usuarios, errores, HTTP)
│       ├── KnowledgePanel.tsx  ← Búsqueda semántica en 3 índices vectoriales
│       ├── UsersTable.tsx      ← Tabla de usuarios con filtros
│       ├── LogsTable.tsx       ← Tabla de logs del sistema
│       ├── AuditTable.tsx      ← Tabla de auditoría HTTP
│       └── types.ts            ← Tipos de DTOs del panel admin
│
└── lib/
    ├── api.ts                  ← Cliente HTTP completo (580 líneas)
    ├── auth-context.tsx         ← Contexto de autenticación JWT
    ├── api-errors.ts           ← Clase ApiHttpError con status code
    ├── errors.ts               ← Utilidad extractErrorMessage()
    └── utils.ts                ← Utilidades (cn() para classnames)
```

---

## 6.3 Rutas principales

| Ruta | Componente | Propósito | Auth requerida |
|---|---|---|---|
| `/` | `LandingPage` (anónimo) / `DashboardPage` (autenticado) | Landing marketing o panel de diagnóstico | No / Sí |
| `/login` | `AuthPage` (login + registro con tabs) | Autenticación JWT | No |
| `/admin` | `AdminLayout` (layout con sidebar lateral) | Panel de administración | Admin |
| `/admin/` | `OverviewCards` | Estadísticas agregadas (usuarios, errores, peticiones HTTP) | Admin |
| `/admin/users` | `UsersTable` | Listado de usuarios con filtros y paginación | Admin |
| `/admin/logs` | `LogsTable` | Logs del sistema (pino + SQLite) | Admin |
| `/admin/audit` | `AuditTable` | Registro de auditoría HTTP | Admin |
| `/admin/knowledge` | `KnowledgePanel` | Búsqueda semántica en índices vectoriales (PIDs, DTCs, diagnósticos) | Admin |

**Autenticación**: el `AuthProvider` en `__root.tsx` valida los tokens JWT en localStorage contra `GET /api/auth/me`. Si no hay tokens o el refresh falla, el usuario se redirige a `/login`. Las rutas admin verifican `auth.user.isAdmin` y muestran 403 si no se cumple.

---

## 6.4 Componentes clave

### 6.4.1 Dashboard de diagnóstico (`DashboardPage`)

Es el corazón de la aplicación. Tras autenticarse y seleccionar un vehículo, el usuario ve el panel de diagnóstico completo. El layout se divide en tres zonas:

```
┌──────────────────────────────────────────────────────┐
│ TopBar: logo · conexión · reloj · selector · logout  │
├──────┬───────────────────────────────────────────────┤
│      │  Contenido de la sección activa               │
│ Side │  (véase tabla abajo)                          │
│ bar  │                                               │
│      │                                               │
├──────┴───────────────────────────────────────────────┤
│ Footer: protocolo · versión                          │
└──────────────────────────────────────────────────────┘
```

#### Sidebar — 8 secciones navegables

Cada sección del sidebar izquierdo controla qué panel se muestra en el área de contenido:

| Sección | Icono | Componente | Descripción |
|---|---|---|---|
| Vehículo | Car | `VehicleStatusPanel` | Estado MIL, conteo DTC, tipo de motor, monitores de emisiones |
| Datos Vivo | Activity | `TelemetrySection` + `PidsTable` | 4 gauges en tiempo real + tabla de PIDs |
| Códigos DTC | AlertTriangle | `DtcPanel` | Pestañas: Almacenadas / Pendientes / Permanentes, con botón "Borrar averías" |
| Freeze Frame | Snowflake | `FreezeFramePanel` | Valores de sensores congelados del DTC seleccionado |
| Unidades Control | Cpu | `EcuInfoPanel` | Tabla de ECUs (nombre, tipo, direcciones CAN, protocolo) |
| Diagnóstico | Stethoscope | `DiagnosisPanel` | Diagnóstico determinista con badge de severidad |
| Chat IA | MessageSquare | `MechanicChat` | Chat conversacional con el LLM (mecánico virtual) |
| Informe | FileText | `SessionReportPanel` | Informe completo: determinista + ECUs + freeze frame + cognitivo |

El sidebar incluye dos indicadores visuales:

- **Badge DTC**: círculo rojo con el número de códigos de avería (se actualiza tras cada diagnóstico).
- **Indicador de diagnóstico**: punto naranja que aparece cuando hay un diagnóstico completado.

#### TopBar

La barra superior muestra, de izquierda a derecha:
1. **Logo + nombre** de la aplicación con la palabra "Diagnostics" en color primario.
2. **Indicador de conexión**: LED verde ("Conectado") o rojo ("Sin conexión") según el estado del stream de telemetría.
3. **Reloj en vivo**: hora actual con segundos, actualizado cada segundo por el hook `useClock`.
4. **Selector de vehículo**: dropdown con los escenarios disponibles.
5. **Botón Admin** (solo visible para administradores): enlace al panel `/admin`.
6. **Botón Logout**: cierra sesión revocando el refresh token.

### 6.4.2 Telemetría en vivo (`TelemetrySection`)

Muestra cuatro instrumentos de medición con datos que se actualizan cada segundo (polling a 1 Hz contra `GET /api/live-data`):

| Instrumento | PID OBD-II | Componente | Visualización |
|---|---|---|---|
| RPM | `01 0C` | `RpmGauge` | Tacómetro circular SVG (0–8000 RPM, zona roja >6500) |
| Refrigerante | `01 05` | `CoolantBar` | Barra vertical con gradiente de color (azul→verde→naranja→rojo) |
| Velocidad | `01 0D` | `SpeedDisplay` | Display digital numérico (km/h) |
| Admisión | `01 0F` | `IntakeThermo` | Termómetro horizontal con gradiente |

Bajo los gauges se encuentra el **botón "Iniciar diagnóstico"** con animación de escaneo durante la carga, y un panel de lectura RAW que muestra la última trama OBD-II recibida.

Los gauges degradan elegantemente: si un PID falla (respuesta `null` del backend), ese gauge individual muestra "—" en lugar de colapsar toda la sección.

La **tabla de PIDs** (`PidsTable`) debajo de los gauges lista los 4 PIDs fijos de la lectura determinista (`01 0C`, `01 05`, `01 0D`, `01 0F`) con su valor y estado (OK/Revisar). Si el diagnóstico cognitivo descubre PIDs adicionales (vía llamadas `read_pid` del LLM), estos se añaden dinámicamente al final de la tabla con una etiqueta "IA".

### 6.4.3 Chat con el Mecánico IA (`MechanicChat`)

El componente `MechanicChat` permite al usuario conversar con el LLM de diagnóstico. Es la interfaz conversacional del sistema:

```
┌─────────────────────────────────────────┐
│ Chat con el Mecánico                    │
│                                         │
│  ┌──────────────────────────┐           │
│  │ [Severidad: Alta] [Conf: 85%]│       │ ← Badges en última respuesta
│  │                            │         │
│  │  Diagnóstico: fallo en     │         │
│  │  sensor MAF, mezcla pobre. │         │ ← Renderizado Markdown
│  │                            │         │
│  │  * Revisar sensor MAF     │         │
│  │  * Limpiar cuerpo mariposa│         │
│  └──────────────────────────┘           │
│                                         │
│ ┌─────────────────┐ ┌──────────┐       │
│ │ Pregunta al mecánico... │ │ Enviar │  │
│ └─────────────────┘ └──────────┘       │
└─────────────────────────────────────────┘
```

**Funcionamiento**:

1. El usuario escribe una pregunta y pulsa "Enviar" (o Enter).
2. La UI envía `POST /api/mcp/cognitive-diagnosis` con `{ scenarioId, query, history }`.
3. El historial de conversación se envía completo en cada petición para mantener el contexto (el backend es stateless).
4. Mientras el LLM procesa (hasta 60 segundos), se muestra un skeleton animado.
5. Al recibir la respuesta, se renderiza con `react-markdown` (soporta negritas, listas, código inline).
6. La última burbuja del asistente incluye badges de **severidad** (Baja/Media/Alta/Crítica) y **confianza** (porcentaje).
7. En caso de error, se muestra un mensaje tipado: timeout (504), no disponible (404), demasiados pasos (422).

La conversación completa se mantiene en la caché de TanStack Query bajo la clave `["cognitive-diagnosis", scenarioId]`. Al cambiar de vehículo, la caché se limpia automáticamente porque la clave cambia.

### 6.4.4 Informe de sesión (`SessionReportPanel`)

Accesible desde la sección "Informe" del sidebar, consolida todos los datos de la sesión de diagnóstico en una sola vista vertical:

1. **Cabecera**: marca, modelo, año, tipo de motor, VIN y fecha.
2. **Diagnóstico determinista**: severidad, narrativa y tabla de DTCs.
3. **ECUs descubiertas**: tabla con nombre, tipo, direcciones CAN y protocolo.
4. **Freeze Frame**: tabla PID→Valor del primer freeze frame disponible.
5. **Diagnóstico cognitivo**: narrativa del LLM, badge de severidad, confianza, recomendaciones (lista con viñetas) y traza de herramientas MCP colapsable (accordion).

Todas las secciones se cargan en paralelo (4 llamadas API concurrentes). Cada sección tiene su propio estado de carga independiente, sin bloquear a las demás.

### 6.4.5 Wizard de identificación del vehículo (`VehicleAutoDetectWizard`)

Antes de acceder al dashboard, el usuario pasa por un wizard de 3 pasos que emula el flujo de una herramienta de escaneo profesional:

1. **Conexión**: lista de escenarios disponibles (ej. "Audi A3 2.0 TFSI — Inactivo"). Cada escenario muestra icono de coche o moto, nombre, marca, modelo y año.
2. **Lectura VIN**: animación de escaneo con radar giratorio mientras `GET /api/vehicle-info` decodifica el VIN. Si falla, se muestra el error con botones "Reintentar" y "Elegir otro vehículo".
3. **Confirmación**: muestra el VIN leído, marca, modelo, año, motor, fabricante (WMI) y origen. El usuario confirma con "Entrar a diagnóstico".

El wizard es una máquina de estados (`selecting → detecting → confirming → done`) gestionada por el hook `useVehicleAutoDetect`.

### 6.4.6 Panel de administración (`/admin`)

El layout admin tiene su propio sidebar independiente con 5 secciones:

| Sección | Componente | API |
|---|---|---|
| Overview | `OverviewCards` | `GET /api/admin/overview` |
| Logs | `LogsTable` | `GET /api/admin/logs` |
| Auditoría | `AuditTable` | `GET /api/admin/audit-logs` |
| Usuarios | `UsersTable` | `GET /api/admin/users` |
| Knowledge | `KnowledgePanel` | `GET /api/admin/knowledge` + `POST /api/admin/knowledge/search` |

El **KnowledgePanel** merece mención especial: permite buscar semánticamente en tres índices vectoriales (LanceDB) que contienen el catálogo de PIDs OBD-II, códigos DTC y diagnósticos históricos. La búsqueda devuelve resultados con puntuación de similitud (distancia coseno).

---

## 6.5 Comunicación con el backend

### 6.5.1 Cliente HTTP (`src/lib/api.ts`)

La UI no usa Axios ni librerías de terceros para peticiones HTTP. Toda la comunicación se realiza con `fetch()` nativo a través de un cliente centralizado de 580 líneas que proporciona:

| Capacidad | Implementación |
|---|---|
| Autenticación JWT | Cabecera `Authorization: Bearer <token>` en cada petición autenticada |
| Refresh automático | `apiFetch()` intercepta 401, refresca el token con single-flight, y reintenta |
| Single-flight refresh | Una única promesa de refresh compartida entre todas las peticiones concurrentes que reciben 401 |
| Timeouts | 10s por defecto, 60s para diagnóstico cognitivo (`AbortSignal.timeout`) |
| Manejo de errores | `assertOk()` extrae mensajes del body JSON (campo `details` o `error`) sin exponer stack traces |
| Persistencia de tokens | `localStorage` con claves `iad.accessToken` e `iad.refreshToken` |

### 6.5.2 Proxy de desarrollo

Vite configura un proxy en `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:4000',
      changeOrigin: true,
    },
  },
}
```

Todas las peticiones a `/api/*` desde el navegador se redirigen al backend en el puerto 4000.

### 6.5.3 Endpoints consumidos por la UI

| Método | Endpoint | Hook/Componente | Propósito |
|---|---|---|---|
| `POST` | `/api/auth/login` | `api.login()` | Iniciar sesión |
| `POST` | `/api/auth/register` | `api.register()` | Registrar usuario |
| `GET` | `/api/auth/me` | `api.getMe()` | Validar sesión actual |
| `POST` | `/api/auth/refresh` | `apiFetch()` (automático) | Renovar access token |
| `POST` | `/api/auth/logout` | `api.logout()` | Revocar refresh token |
| `GET` | `/api/scenarios` | `useScenarios` | Listar escenarios de simulación |
| `POST` | `/api/diagnosis` | `useDiagnosis` | Diagnóstico determinista OBD-II |
| `GET` | `/api/live-data?scenarioId=` | `useLiveTelemetry` | Telemetría en vivo (polling 1 Hz) |
| `GET` | `/api/ecu-info?scenarioId=` | `useEcuInfo` | ECUs del vehículo |
| `GET` | `/api/freeze-frame?scenarioId=&dtc=` | `useFreezeFrame` | Freeze frame de un DTC |
| `GET` | `/api/vehicle-info?scenarioId=` | `useVehicleAutoDetect` | Identificar vehículo por VIN |
| `GET` | `/api/pending-dtc?scenarioId=` | `usePendingDtc` | DTC pendientes (Modo 07) |
| `GET` | `/api/permanent-dtc?scenarioId=` | `usePermanentDtc` | DTC permanentes (Modo 0A) |
| `POST` | `/api/clear-dtc` | `useClearDtc` | Borrar DTC almacenados |
| `GET` | `/api/vehicle-status?scenarioId=` | `useVehicleStatus` | Estado MIL y monitores |
| `POST` | `/api/mcp/cognitive-diagnosis` | `useCognitiveDiagnosis` | Diagnóstico cognitivo LLM |
| `GET` | `/api/mcp/capabilities` | `useCapabilities` | Disponibilidad del LLM |
| `GET` | `/api/admin/overview` | `OverviewCards` | Estadísticas agregadas |
| `GET` | `/api/admin/logs` | `LogsTable` | Logs del sistema |
| `GET` | `/api/admin/audit-logs` | `AuditTable` | Auditoría HTTP |
| `GET` | `/api/admin/users` | `UsersTable` | Listado de usuarios |
| `GET` | `/api/admin/knowledge` | `KnowledgePanel` | Estadísticas de índices vectoriales |
| `POST` | `/api/admin/knowledge/search` | `KnowledgePanel` | Búsqueda semántica |

### 6.5.4 Sin WebSocket

La aplicación **no utiliza WebSocket, Server-Sent Events ni polling largo**. La telemetría en vivo se obtiene mediante polling HTTP convencional: TanStack React Query re-ejecuta `GET /api/live-data` cada 1000 ms (`refetchInterval: 1000`). La cadencia de 1 Hz se eligió deliberadamente (en lugar de 2 Hz) porque el adaptador ELM327 serializa los comandos en una cola FIFO sobre una única conexión TCP, y 1 Hz deja margen suficiente para evitar solapamiento de peticiones.

### 6.5.5 Gestión de estado asíncrono (TanStack Query)

Cada fuente de datos del backend se modela como una query de TanStack Query con su propia clave:

```typescript
// Ejemplo: telemetría en vivo con polling
useQuery({
  queryKey: ["live-telemetry", selectedId],
  queryFn: () => api.getLiveData(selectedId),
  enabled: selectedId.length > 0,
  refetchInterval: 1000, // 1 Hz
});
```

Las mutaciones (diagnóstico, clear DTC, chat) usan `useMutation` y actualizan la caché mediante `queryClient.setQueryData()`. Esto evita re-fetcheos innecesarios y mantiene la UI reactiva.

---

## 6.6 Flujo UX del diagnóstico

El flujo completo que experimenta un usuario es el siguiente:

### Paso 1: Landing page o Login

- Usuario anónimo → ve la `LandingPage` (marketing con mockup de la interfaz).
- Hace clic en "Iniciar sesión" o "Registrarse" → va a `/login`.
- Si ya tiene tokens válidos en localStorage, va directo al dashboard.

### Paso 2: Selección de vehículo (Wizard)

Tras autenticarse, el usuario ve el `VehicleAutoDetectWizard`:

1. Elige un escenario de la lista (ej. "Audi A3 2.0 TFSI").
2. La app lee el VIN del vehículo (`GET /api/vehicle-info`) mostrando una animación de radar.
3. Se muestra la información decodificada del VIN (marca, modelo, año, motor).
4. El usuario confirma con "Entrar a diagnóstico".

### Paso 3: Dashboard — Telemetría en vivo

Al confirmar, se disparan automáticamente:

1. **Diagnóstico determinista** (`POST /api/diagnosis`) — tarda ~1-2 segundos. Al completar, se muestra un toast "Diagnóstico completado" con la severidad.
2. **Diagnóstico cognitivo** (`POST /api/mcp/cognitive-diagnosis`) — se lanza en paralelo sin `await`, puede tardar hasta 60s. No bloquea la interfaz.
3. **Telemetría en vivo** (`GET /api/live-data` cada 1s) — los 4 gauges comienzan a actualizarse.

La sección por defecto es "Datos Vivo", donde el usuario ve los gauges con valores reales y la tabla de PIDs.

### Paso 4: Exploración de secciones

El usuario navega por el sidebar para inspeccionar:

- **Códigos DTC**: ve las averías en 3 pestañas. Puede hacer clic en un código para ver su freeze frame.
- **Freeze Frame**: consulta los valores de sensores en el momento del fallo.
- **Unidades de Control**: inspecciona las ECUs conectadas al bus CAN.
- **Diagnóstico**: lee el informe determinista con severidad y narrativa.

### Paso 5: Chat con el mecánico IA

En la sección "Chat IA", el usuario puede:

1. Hacer preguntas en lenguaje natural ("¿Por qué falla el sensor de oxígeno?")
2. Recibir respuestas del LLM formateadas en Markdown.
3. Ver la severidad y confianza del diagnóstico.
4. Mantener una conversación multi-turno con contexto completo.
5. El LLM puede llamar herramientas MCP (`read_pid`, `get_dtc_codes`, `get_freeze_frame`, etc.) de forma transparente.

### Paso 6: Informe de sesión

La sección "Informe" consolida todos los hallazgos en una vista imprimible con:
- Datos del vehículo
- Diagnóstico determinista completo
- ECUs descubiertas
- Freeze frame
- Diagnóstico cognitivo con recomendaciones y traza de herramientas

---

## 6.7 Tema visual y estética

La UI sigue una estética de **herramienta de taller profesional**, inspirada en escáneres OBD-II como Autel:

| Elemento | Valor |
|---|---|
| Fondo | `#0d1117` (gris muy oscuro) |
| Color primario | `#ff6b35` (naranja quemado) |
| Acento | `#00d4aa` (verde neón) |
| Peligro | `#ff3333` (rojo) |
| Advertencia | `#f5b301` (ámbar) |
| Tipografía UI | Inter (sans-serif) |
| Tipografía datos | JetBrains Mono (monoespaciada, números tabulares) |

**Animaciones CSS personalizadas**:

- `led-pulse`: pulso verde en el indicador de conexión "En Vivo".
- `scan-sweep`: barrido horizontal durante el diagnóstico (efecto escáner).
- `border-scan`: borde pulsante naranja durante el escaneo.
- `fade-up`: entrada con desvanecimiento y desplazamiento hacia arriba (usada en listas y tarjetas).

**Efectos de fondo**:

- Grid ambiental de 32px con líneas semi-transparentes.
- Gradientes radiales en esquinas (naranja arriba-izquierda, verde abajo-derecha).
- Paneles con `backdrop-filter: blur(10px)` sobre fondo negro semi-transparente.

---

## 6.8 Discrepancias detectadas

Durante la investigación del código real se identificaron las siguientes diferencias entre la documentación del proyecto (README, specs, landing page) y la implementación real de la UI:

### 6.8.1 README vs. código real

| Documentado | Realidad en código |
|---|---|
| "Selector de vehículos: escenarios reales del backend (Audi A3, Kawasaki Z900)" | Existe un wizard completo de 3 pasos (`VehicleAutoDetectWizard`) con lectura y decodificación de VIN, no un simple selector desplegable. |
| README lista 6 tools MCP | El spec `ecu-info-screen` añade una 7ª tool `get_ecu_info`, ya implementada en backend pero no reflejada en el README. |
| Endpoint `/api/mcp/tools/:toolName` documentado como usable directamente | La UI no consume este endpoint; el diagnóstico cognitivo usa exclusivamente `POST /api/mcp/cognitive-diagnosis`. |
| Stack: TanStack Start mencionado como dependencia | La app funciona como SPA pura; `start.ts` solo contiene un middleware de error mínimo para SSR, que no se usa activamente. |

### 6.8.2 Landing page vs. código real

| Afirmación en LandingPage | Realidad |
|---|---|
| "Transmite los parámetros en vivo a 2 Hz" | La telemetría usa 1 Hz (`LIVE_TELEMETRY_INTERVAL_MS = 1000`), con justificación técnica explícita en el código sobre la cola FIFO del ELM327. |
| "Historial y reportes PDF — Cada escaneo queda registrado por matrícula y se exporta como informe listo para el cliente" | No existe funcionalidad de exportación PDF ni historial persistente de escaneos. El `SessionReportPanel` muestra el informe en pantalla pero no tiene botón de exportación. |
| "Registrado por matrícula" | El sistema usa VIN (Vehicle Identification Number), no matrícula. No existe campo de matrícula en la UI ni en la API. |
| Testimonios de "Marc Vidal" (Andorra), "Lucía Ferrer" (Valencia), "Óscar Ruiz" (Zaragoza) | Son contenido placeholder de marketing; no corresponden a usuarios reales del sistema. |

### 6.8.3 Funcionalidades ausentes

| Funcionalidad | Estado |
|---|---|
| Recuperación de contraseña | No implementada en la UI (no hay ruta `/forgot-password` ni formulario de reset). |
| Perfil de usuario / Configuración | No existe página para editar perfil, cambiar contraseña o preferencias. |
| Exportación PDF de informes | No implementada; el informe solo se visualiza en pantalla. |
| Historial de diagnósticos | No hay vista de histórico; el `SessionReportPanel` muestra solo la sesión actual. |
| Dashboard de flota (multi-vehículo) | No implementado; se diagnostica un vehículo a la vez. |
| Conexión por USB/Serial | No hay UI para configurar conexión directa por cable; solo escenarios simulados. |

### 6.8.4 Especificaciones OpenSpec no implementadas en UI

| Spec | Estado en UI |
|---|---|
| Cambio `add-usb-serial-connection-type` (activo sin empezar) | No implementado — la UI no distingue entre tipos de conexión. |
| Cambio `add-diagnosis-history` (activo sin empezar) | No implementado — no existe vista de historial. |
| Cambio `add-user-profiles` (activo sin empezar) | No implementado — no hay página de perfil. |
| Cambio `add-monitor-reset-on-clear-dtc` (activo sin empezar) | El botón "Borrar averías" ya existe pero el spec describe un comportamiento adicional de reseteo de monitores que puede no estar completo. |

---

## 6.9 Tests

La UI cuenta con tests unitarios (Vitest + Testing Library) y tests end-to-end (Playwright):

```bash
pnpm test           # Tests unitarios (Vitest)
pnpm test:e2e       # Tests E2E (Playwright)
```

Los hooks de datos están cubiertos con tests que mockean el cliente `api`, verificando estados de carga, éxito y error. Los componentes de formulario (login, registro) validan esquemas Zod con mensajes de error en español.

---

> **Nota**: Este documento refleja el estado del código en la rama `develop` a fecha de agosto 2026. Las discrepancias señaladas en §6.8 representan oportunidades de mejora identificadas durante la investigación para el tribunal del TFM.
