# Documentación del proyecto

> Filosofía: **Documentación As You Code** — la documentación se escribe al mismo tiempo que el código, en el mismo repositorio, junto a la funcionalidad que describe.

## Estructura

```
docs/
├── README.md          # Este archivo — convenciones de documentación
├── adr/               # Architectural Decision Records
│   ├── 001-arquitectura-del-sistema.md
│   ├── 002-persistencia-de-datos.md
│   ├── 003-diagnostico-cognitivo-mcp.md
│   └── 004-elm327-emulador-docker.md
├── infrastructure/    # Guias de infraestructura y servicios
│   └── elm327-emulator.md
└── db/                # Esquemas y propuestas de base de datos
    └── schema-proposal.md
```

## Convenciones

### TSDoc / JSDoc

Todo el código TypeScript se documenta con **TSDoc** (el equivalente TypeScript de JSDoc).

**Qué documentar con TSDoc:**

| Elemento | TSDoc obligatorio | Ejemplo |
|---|---|---|
| **Entidades** (`domain/entities/`) | Sí — clase/type + cada campo | `@param valorRaw - Los bytes de la trama OBD` |
| **Interfaces** (`domain/repositories/`) | Sí — cada método | `@returns Promise con los DTCs activos` |
| **Casos de uso** (`usecases/`) | Sí — propósito + flujo | `@description Ejecuta el diagnóstico determinista` |
| **Adaptadores** (`infrastructure/`) | Sí — descripción de lo que implementan | `@remarks Simula la ECU de un Audi A3 2.0 TDI` |
| **Funciones internas** | A criterio — solo si no es obvio | |
| **Tests** | No — el nombre del test es la documentación | |

**Formato estándar:**

```ts
/**
 * Breve descripción del propósito.
 *
 * @param primerParametro - Qué representa.
 * @param segundoParametro - Qué representa.
 * @returns Qué devuelve.
 * @throws {TipoDeError} Cuándo lanza el error.
 *
 * @remarks
 * Detalles adicionales: algoritmo, edge cases, referencias.
 */
```

### ADR (Architectural Decision Records)

Se usa el formato [ADR de Michael Nygard](https://github.com/joelparkerhenderson/architecture-decision-record):

```md
# ADR NNN: Título descriptivo

**Estado:** [Aprobado | Propuesto | Deprecado]
**Fecha:** YYYY-MM-DD
**Contexto:** Por qué necesitamos tomar esta decisión

---

## Contexto
...

## Decisión
...

## Consecuencias
**Positivas:** ...
**Negativas:** ...

## Alternativas consideradas
| Alternativa | Razón para descartar |
|---|---|

## Referencias
```

### README de proyecto

El `README.md` raíz es el punto de entrada: debe responder a qué hace el proyecto, cómo empezar, su arquitectura y cómo ejecutar tests. No duplica información que ya está en ADRs — referencia los ADRs.

### Documentación de tests

Los tests se nombran con el patrón `*.test.ts` y se colocan junto al código que prueban (ej. `hexParser.test.ts` junto a `hexParser.ts`). El nombre del `describe`/`it` debe ser autoexplicativo:

```ts
describe('hexParser', () => {
  it('convierte una trama de temperatura de 2 bytes a grados Celsius', () => { ... })
})
```

## Verificación en CI

El proyecto usa `eslint-plugin-jsdoc` integrado en `pnpm lint` para verificar que los exports publicos tengan TSDoc. Se ejecuta en el pipeline antes de `build`.

## Cómo añadir documentación

1. **Nuevo archivo .ts** → escribe el TSDoc mientras implementas (no al final)
2. **Nueva decisión arquitectónica** → crea un ADR en `docs/adr/`
3. **Cambio de schema** → actualiza `docs/db/schema-proposal.md`
4. **README se actualiza** solo cuando cambia la visión general del proyecto
