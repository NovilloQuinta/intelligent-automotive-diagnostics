# ADR 001: Arquitectura del Sistema

**Estado:** Aprobado (revisado Fase 3)
**Fecha:** 2026-07-06 | **Revisado:** 2026-07-21
**Contexto:** Inicio del proyecto TFM + Refactorizacion Clean Architecture + Hexagonal

---

## Contexto

El proyecto requiere un backend capaz de:

- Simular telemetria OBD-II de vehiculos (Audi A3, Kawasaki Z900)
- Parsear tramas binarias a magnitudes fisicas (SAE J1979)
- Ejecutar diagnosticos deterministas sobre los datos parseados
- Exponer herramientas a un LLM via protocolo MCP para diagnostico cognitivo
- Ser demostrable en vivo ante un tribunal el 20 de julio de 2026

Se necesita una arquitectura que maximice la testabilidad, permita cambiar de proveedor de IA sin modificar la logica core, y sea facil de explicar en la defensa.

## Decision

Se adopta **Clean Architecture + Hexagonal (Ports & Adapters)** con **MCP como adaptador de IA**:

```
src/
├── main.ts              # Composition root + entry point
│
├── domain/              # Capa interna: Value Objects + Entidades
│   ├── vin.ts           #   Vin value object (ISO 3779)
│   ├── pidCode.ts       #   PidCode value object
│   └── ...              #   Entidades puras (sin deps externas)
│
├── application/         # Capa intermedia: Puertos + Casos de uso
│   ├── ports/           #   Contratos (interfaces puras)
│   └── use-cases/       #   Orquestacion de negocio
│
└── infrastructure/      # Capa externa: Adaptadores concretos
    ├── http/            #   Express (routes + middleware)
    ├── services/        #   Servicios transversales
    ├── obd/             #   Hardware OBD-II (simulador + parsers)
    ├── mcp/             #   MCP tools
    └── persistence/     #   SQLite + futuro LanceDB
```

### Reglas clave

1. **domain/** no importa nada de `application/` ni `infrastructure/`
2. **application/** depende solo de `domain/` — NUNCA importa `infrastructure/`
3. **infrastructure/** implementa los puertos de `application/ports/` y se inyecta desde `main.ts` (composition root)
4. **MCP Server** es un adaptador de infraestructura — expone tools al LLM pero no contiene logica de negocio
5. **Value Objects** encapsulan validacion en `domain/` (Vin ISO 3779, PidCode hex)
6. **Convencion de naming**: `resource.type.ts` en infraestructura (`auth.routes.ts`, `auth.middleware.ts`)

### Dependencias entre capas (inviolables)

```
domain ← application ← infrastructure
   ↑          ↑             ↑
   └── imports flow this way ──┘
```

## Consecuencias

**Positivas:**

- Testabilidad: domain y application se prueban con mocks sin levantar servidores
- Independencia del framework: Express se cambia desde un solo punto
- Independencia del proveedor de IA: el LLM solo ve las tools del MCP Server
- Value Objects garantizan datos validos en toda la app
- Claridad en la defensa: 3 capas + composition root, patron hexagonal

**Negativas:**

- Mayor numero de ficheros que un enfoque monolitico
- La inyeccion manual en `main.ts` crece con cada nuevo adaptador
- Curva de aprendizaje inicial para Clean Architecture + Hexagonal

## Historial de revisiones

| Fecha | Cambio |
|---|---|
| 2026-07-06 | ADR inicial: Clean Architecture 3 capas |
| 2026-07-21 | Fase 3: Refactorizacion a Clean + Hexagonal. Value Objects (Vin, PidCode), puertos con sufijo Port, naming `resource.type.ts`, `application/ports/` + `application/use-cases/` |

## Referencias

- Clean Architecture (Robert C. Martin, 2017)
- Hexagonal Architecture (Alistair Cockburn, 2005)
- Model Context Protocol Specification (Anthropic, 2024)
- SAE J1979 — estandar de diagnostico OBD-II
