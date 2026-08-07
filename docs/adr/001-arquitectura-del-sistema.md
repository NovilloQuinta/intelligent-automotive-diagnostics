# ADR 001: Arquitectura del Sistema

**Estado:** Aprobado (revisado Fase 4)
**Fecha:** 2026-07-06 | **Revisado:** 2026-08-04
**Contexto:** TFM — Arquitectura limpia con dominio rico y puertos/adaptadores

---

## Contexto

El proyecto requiere un backend capaz de:

- Simular telemetria OBD-II de vehiculos (Audi A3, Kawasaki Z900)
- Parsear tramas binarias a magnitudes fisicas (SAE J1979)
- Ejecutar diagnosticos deterministas sobre los datos parseados
- Exponer herramientas a un LLM via protocolo MCP para diagnostico cognitivo
- Logging estructurado (pino) con persistencia de logs y auditoria HTTP
- Ser demostrable en vivo ante un tribunal en julio 2026

Se necesita una arquitectura que maximice la testabilidad, permita cambiar de proveedor de IA sin modificar la logica core, y sea facil de explicar en la defensa.

## Decision

Se adopta **Clean Architecture + Hexagonal (Ports & Adapters)** con **MCP como adaptador de IA**:

```
src/
├── main.ts                     # Entry point (10 lineas)
│
├── domain/                     # Capa interna
│   ├── entities/               #   Entidades con identidad (id obligatorio)
│   │   ├── User.ts             #   Usuario de la app
│   │   ├── DiagnosisSession.ts #   Sesion de diagnostico
│   │   ├── VehicleProfile.ts   #   Perfil de vehiculo (agregado)
│   │   └── ...
│   ├── value-objects/          #   Value Objects inmutables (sin identidad)
│   │   ├── Vin.ts              #   VIN ISO 3779
│   │   ├── Email.ts            #   Email validado
│   │   ├── DtcCode.ts          #   Codigo DTC SAE J2012
│   │   ├── LiveData.ts         #   Telemetria (rpm, temp, velocidad)
│   │   └── ...
│   └── pids.ts                 #   Constantes OBD-II (modos, PIDs)
│
├── application/                # Capa intermedia
│   ├── ports/                  #   Contratos (interfaces puras)
│   │   ├── UserRepository.ts   #   Repositorio de usuarios
│   │   ├── ObdRepository.ts    #   Repositorio de datos OBD-II
│   │   ├── LlmClientPort.ts    #   Puerto de cliente LLM
│   │   ├── LoggerPort.ts       #   Puerto de logging
│   │   └── ...
│   ├── use-cases/              #   Casos de uso (clases con execute())
│   │   ├── RegisterUserUseCase.ts
│   │   ├── ProcessVehicleDiagnosisUseCase.ts
│   │   └── ...
│   ├── dto/                    #   Data Transfer Objects (1 por fichero)
│   ├── llm/                    #   Anti-corruption parser LLM
│   └── shared/                 #   Utilidades compartidas
│
└── infrastructure/             # Capa externa
    ├── composition/            #   Composition Root (cablea todo)
    ├── configuration/          #   Validacion de env vars (Zod)
    ├── http/
    │   ├── controllers/        #   Controladores Express
    │   ├── routes/             #   Rutas (solo endpoints)
    │   ├── middleware/         #   Auth, rate-limit, audit, request-id
    │   └── server.ts           #   Factory de Express
    ├── observability/          #   Logger (pino + SQLite)
    ├── persistence/
    │   ├── sqlite/             #   Repositorios Drizzle
    │   └── mappers/            #   Row ↔ Entity mapping
    ├── llm/                    #   Adaptadores Anthropic/OpenAI
    ├── mcp/                    #   Servidor MCP in-process
    ├── simulation/             #   Simulador OBD-II + escenarios
    ├── elm327/                 #   Adaptador TCP ELM327
    └── services/               #   AuthService (bcrypt + JWT)
```

### Reglas clave

1. **domain/** no importa nada de `application/` ni `infrastructure/`
2. **application/** depende solo de `domain/` — NUNCA importa `infrastructure/`
3. **infrastructure/** implementa los puertos de `application/ports/` y se inyecta desde `composition.ts`
4. **MCP Server** es un adaptador de infraestructura — expone tools al LLM pero no contiene logica de negocio
5. **Entidades** tienen `id: number` obligatorio en su constructor (nunca opcional)
6. **Value Objects** son clases inmutables con constructor publico y validacion inline
7. **Use Cases** son clases con metodo `execute()`, dependencias inyectadas por constructor
8. **DTOs** son interfaces puras de datos, uno por fichero en `application/dto/`
9. **Puertos** de repositorio sin sufijo `Port` (`UserRepository`), servicios externos con `Port` (`LlmClientPort`)

### Convencion de naming

| Elemento | Convencion | Ejemplo |
|---|---|---|
| Entidad | `VerbNoun.ts` | `User.ts`, `DiagnosisSession.ts` |
| Value Object | `Noun.ts` | `Vin.ts`, `Email.ts`, `DtcCode.ts` |
| Puerto (repo) | `EntityRepository.ts` | `UserRepository.ts` |
| Puerto (servicio) | `ServicePort.ts` | `LlmClientPort.ts` |
| Use case | `VerbNounUseCase.ts` | `RegisterUserUseCase.ts` |
| DTO | `VerbNounInput/Output.ts` | `RegisterUserInput.ts` |
| Controller | `NounController.ts` | `AuthController.ts` |

### Dependencias entre capas (inviolables)

```
domain ← application ← infrastructure
   ↑          ↑             ↑
   └── imports flow this way ──┘
```

## Consecuencias

**Positivas:**

- Testabilidad: 432 tests (33 ficheros) sin levantar servidores
- Independencia del framework: Express se cambia desde un solo punto
- Independencia del proveedor de IA: el LLM solo ve las tools del MCP Server
- Entidades con `id` obligatorio garantizan identidad siempre presente
- Value Objects garantizan datos validos en toda la app
- Use cases como clases facilitan la inyeccion de dependencias y testing
- Composition root en `composition.ts` centraliza todo el wiring
- Logging estructurado con pino + persistencia en tabla `logs`
- Auditoria HTTP automatica en tabla `audit_logs`

**Negativas:**

- Mayor numero de ficheros que un enfoque monolitico
- La inyeccion manual en `composition.ts` crece con cada nuevo adaptador

## Historial de revisiones

| Fecha | Cambio |
|---|---|
| 2026-07-06 | ADR inicial: Clean Architecture 3 capas |
| 2026-07-21 | Fase 3: Refactorizacion a Clean + Hexagonal. Value Objects (Vin, PidCode), puertos con sufijo Port, naming `resource.type.ts` |
| 2026-08-04 | Fase 4: Dominio enriquecido (entities/ + value-objects/, id obligatorio, constructores publicos, sin static create). Aplicacion reestructurada (DTOs en dto/, use cases a clases con execute(), puertos sin Port en repos). Infraestructura completa (controllers, configuration, observability con pino, mappers, composition root) |

## Referencias

- Clean Architecture (Robert C. Martin, 2017)
- Hexagonal Architecture (Alistair Cockburn, 2005)
- Model Context Protocol Specification (Anthropic, 2024)
- SAE J1979 — estandar de diagnostico OBD-II
