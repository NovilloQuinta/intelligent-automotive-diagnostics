# Domain PID Concepts

## Purpose

Conceptos de dominio SAE J1979 para fórmulas de PID OBD-II: el type `PidFormulaEntry` (entrada de fórmula con expresión aritmética y bytes esperados) y la función pura `bigEndian` (interpretación big-endian de secuencia de bytes, usada como fallback para PIDs sin fórmula conocida). El puerto `PidFormulaCatalogPort` define el contrato del catálogo de fórmulas en `application/ports/`.

## Requirements

### Requirement: PidFormulaEntry type en dominio
El sistema SHALL definir `PidFormulaEntry` en `domain/pidFormulaEntry.ts` como una interface inmutable con `formula: string` (expresión aritmética SAE J1979) y `dataBytes: number` (bytes esperados en la respuesta).

#### Scenario: Type sin dependencias externas
- **GIVEN** `domain/pidFormulaEntry.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** no importa de `application/` ni `infrastructure/`
- **AND** solo exporta `PidFormulaEntry` como named export

#### Scenario: Type usado por application/ports
- **GIVEN** `application/ports/PidFormulaCatalogPort.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** importa `PidFormulaEntry` desde `@/domain/pidFormulaEntry.js`

---

### Requirement: bigEndian pure function en dominio
El sistema SHALL definir `bigEndian` en `domain/bigEndian.ts` como una función pura que recibe `number[]` y devuelve el entero big-endian resultante de `bytes.reduce((acc, b) => acc * 256 + b, 0)`.

#### Scenario: Cálculo big-endian de 2 bytes
- **GIVEN** bytes `[0x0C, 0x80]`
- **WHEN** se invoca `bigEndian([0x0C, 0x80])`
- **THEN** devuelve `3200`

#### Scenario: Array vacío devuelve 0
- **GIVEN** bytes `[]`
- **WHEN** se invoca `bigEndian([])`
- **THEN** devuelve `0`

#### Scenario: Función sin dependencias externas
- **GIVEN** `domain/bigEndian.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** no importa de `application/`, `infrastructure/`, ni otros módulos de `domain/`
- **AND** no lanza excepciones — es una función pura

---

### Requirement: PidFormulaCatalogPort interface en application/ports
El sistema SHALL definir `PidFormulaCatalogPort` en `application/ports/PidFormulaCatalogPort.ts` (PascalCase) como una interface con métodos `get(mode, pid): PidFormulaEntry | undefined` y `apply(mode, pid, bytes): number`.

#### Scenario: Puerto importa solo de dominio
- **GIVEN** `application/ports/PidFormulaCatalogPort.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** solo importa `PidFormulaEntry` desde `@/domain/pidFormulaEntry.js`
- **AND** no importa de `infrastructure/` ni de otros módulos de `application/`

#### Scenario: get devuelve PidFormulaEntry o undefined
- **GIVEN** una implementación de `PidFormulaCatalogPort`
- **WHEN** se invoca `catalog.get("01", "0C")`
- **THEN** devuelve `PidFormulaEntry` si la fórmula existe, `undefined` si no

#### Scenario: apply aplica fórmula o fallback
- **GIVEN** una implementación de `PidFormulaCatalogPort`
- **WHEN** se invoca `catalog.apply("01", "0C", bytes)`
- **THEN** devuelve el valor físico calculado (fórmula conocida) o el fallback big-endian (fórmula desconocida)
