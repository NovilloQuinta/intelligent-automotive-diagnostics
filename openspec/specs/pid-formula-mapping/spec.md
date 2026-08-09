# PID Formula Mapping

## Purpose

Mapping entre conceptos de dominio (definiciones de PID) y entradas de catálogo de fórmulas: el structural type `PidFormulaSource` (acepta cualquier objeto con `pidCode.key`, `formula`, `dataBytes`) y la función `pidDefinitionsToFormulaEntries` que convierte definiciones a entradas de catálogo filtrando fórmulas vacías.

## Requirements

### Requirement: PidFormulaSource structural type en application/shared
El sistema SHALL definir `PidFormulaSource` en `application/shared/pidFormulaSource.ts` como una interface con `pidCode: { readonly key: string }`, `formula: string | { toString(): string }`, y `dataBytes: number`.

#### Scenario: Structural typing acepta PidDefinition
- **GIVEN** un objeto `{ pidCode: new PidCode('01', '0C'), formula: '(A*256+B)/4', dataBytes: 2 }`
- **WHEN** se pasa como `PidFormulaSource` a `pidDefinitionsToFormulaEntries`
- **THEN** el structural typing acepta el objeto sin requerir instanceof

#### Scenario: Acepta Formula value objects con toString()
- **GIVEN** un objeto con `formula` siendo un value object con método `toString()`
- **WHEN** se pasa como `PidFormulaSource`
- **THEN** `pidDefinitionsToFormulaEntries` invoca `toString()` para obtener la fórmula como string

#### Scenario: Type sin dependencias externas
- **GIVEN** `application/shared/pidFormulaSource.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** no importa de `infrastructure/`
- **AND** solo exporta `PidFormulaSource` como named export

---

### Requirement: pidDefinitionsToFormulaEntries en application/shared
El sistema SHALL definir `pidDefinitionsToFormulaEntries` en `application/shared/pidDefinitionsToFormulaEntries.ts` que convierte un `Iterable<PidFormulaSource>` a `Array<readonly [string, PidFormulaEntry]>`, filtrando automáticamente las definiciones con fórmula vacía.

#### Scenario: Conversión de definiciones a entries
- **GIVEN** definiciones `[{ pidCode: { key: "01 0C" }, formula: "(A*256+B)/4", dataBytes: 2 }]`
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(definitions)`
- **THEN** devuelve `[["01 0C", { formula: "(A*256+B)/4", dataBytes: 2 }]]`

#### Scenario: Filtrado de fórmulas vacías
- **GIVEN** definiciones incluyendo `{ pidCode: { key: "09 02" }, formula: "", dataBytes: 17 }` (VIN, pidType ascii)
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(definitions)`
- **THEN** la entrada con fórmula vacía se excluye del resultado

#### Scenario: Conversión de fórmula con toString()
- **GIVEN** definición con `formula` siendo un objeto con `toString() => "(A*256+B)/4"`
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(definitions)`
- **THEN** la fórmula se convierte a string vía `toString()` y se incluye en la entry

#### Scenario: Dependencias limpias
- **GIVEN** `application/shared/pidDefinitionsToFormulaEntries.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** importa `PidFormulaEntry` de `@/domain/pidFormulaEntry.js`
- **AND** importa `PidFormulaSource` de `./pidFormulaSource.js`
- **AND** no importa de `infrastructure/`
