# ADR 001: Arquitectura del Sistema

**Estado:** Aprobado
**Fecha:** 2026-07-06
**Contexto:** Inicio del proyecto TFM

---

## Contexto

El proyecto requiere un backend capaz de:

- Simular telemetría OBD-II de vehículos (Audi A3, Kawasaki Ninja)
- Parsear tramas binarias a magnitudes físicas (SAE J1979)
- Ejecutar diagnósticos deterministas sobre los datos parseados
- Exponer herramientas a un LLM vía protocolo MCP para diagnóstico cognitivo
- Ser demostrable en vivo ante un tribunal el 20 de julio de 2026

Se necesita una arquitectura que maximice la testabilidad, permita cambiar de proveedor de IA sin modificar la lógica core, y sea fácil de explicar en la defensa.

## Decisión

Se adopta **Clean Architecture en 3 capas** con **MCP como adaptador de IA**:

```
src/
├── domain/           # Capa 1: Entidades e interfaces puras (sin dependencias externas)
├── usecases/         # Capa 2: Lógica de aplicación / orquestación
└── infrastructure/   # Capa 3: Adaptadores técnicos (simulador, parsers, MCP, HTTP)
    └── db/           #   └── Persistencia (añadida en ADR 002)
```

### Reglas clave

1. **domain/** no importa nada de `infrastructure/` ni `usecases/`
2. **usecases/** depende solo de interfaces definidas en `domain/`
3. **infrastructure/** implementa las interfaces de `domain/` y se inyecta desde `main.ts` (composition root)
4. **MCP Server** es un adaptador más en infraestructura — expone herramientas al LLM pero no contiene lógica de negocio
5. Las decisiones de IA (qué modelo, cómo se llama) se aíslan en `usecases/agents/`

## Consecuencias

**Positivas:**

- Testabilidad absoluta: domain y usecases se prueban con mocks sin levantar servidores
- Independencia del framework: Express o Fastify se cambian desde un solo punto
- Independencia del proveedor de IA: el LLM solo ve las tools del MCP Server
- Claridad en la defensa del TFM: las 3 capas se explican en 1 minuto

**Negativas:**

- Mayor número de ficheros que un enfoque monolítico
- La inyección manual en `main.ts` crece con cada nuevo adaptador
- Curva de aprendizaje inicial para alguien no familiarizado con Clean Architecture

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **Monolito sin capas** | Dificulta testear la lógica de negocio sin el simulador; mala separación de concerns |
| **Microservicios** | Over-engineering para un TFM; complejidad de red innecesaria |
| **Arquitectura Hexagonal** | Válida, pero Clean Architecture es más conocida en el ámbito académico y más fácil de defender |
| **MVC clásico (Modelo-Vista-Controlador)** | El LLM no es una "vista"; MCP encaja mejor como adaptador en infraestructura |

## Referencias

- Clean Architecture (Robert C. Martin, 2017)
- Model Context Protocol Specification (Anthropic, 2024)
- SAE J1979 — estándar de diagnóstico OBD-II
