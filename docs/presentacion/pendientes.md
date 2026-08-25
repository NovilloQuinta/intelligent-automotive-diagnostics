# Pendientes para cerrar la defensa

> Estado a 2026-08-25. El deck vive en `docs/presentacion/` y se genera con `build.mjs`.
> Lo que sigue son las tareas que quedan, separadas por quien las puede hacer.

## Solo las puede hacer el autor

1. **Reescribir la slide 6, "Arquitectura: Clean Architecture y patron hexagonal".**
   El borrador actual no convence al autor. Las razones reales estan en `docs/adr/001`
   y en lo que el autor conto: el dominio son normas (SAE J1979, ISO 15031, ISO 3779,
   las formulas de PID, la decodificacion del VIN), y por eso no puede mezclarse con la
   base de datos ni con el LLM. Ademas, un solo programador.
2. **Grabar el video del coche real.** El guion esta en `docs/guion-demo.md`. Cuando
   exista, sustituye una de las cuatro capturas de la slide 14.
3. **Capturas del diagnostico cognitivo.** Necesitan `LLM_API_KEY` real, que solo esta
   en la maquina del autor.
4. **Ensayar con cronometro.** Cada slide lleva en sus notas el tiempo acumulado.
   El deck suma ~17 min; el limite habitual son 15.

## Se pueden delegar a un agente

Ver el prompt de abajo.

---

## Prompt listo para pegar en una sesion nueva

```
Trabaja en el repo intelligent-automotive-diagnostics, rama claude/tfm-slide-presentation-2fflme.
Lee AGENTS.md antes de nada y respetalo: autoria del commit siempre
"Jesús Ángel Novillo Lucas-Vaquero <jesusangelquintanar@gmail.com>", sin Co-Authored-By ni
enlaces a claude.ai, asunto de commit corto en formato convencional, y pregunta antes de
commitear o pushear.

Hay cuatro tareas. Estan documentadas en docs/deuda-conocida.md, en las dos primeras
secciones. Haz cada una en su rama desde develop, con TDD donde toque, y corre
`pnpm verify` antes de dar nada por bueno.

TAREA 1 — El umbral de cobertura del Core no exige nada (la mas importante)
apps/core-api/vitest.config.ts:58 exige 100% a la ruta
'src/application/use-cases/processVehicleDiagnosis.ts'. Ese fichero se renombro a
ProcessVehicleDiagnosisUseCase.ts en el commit 5546536, asi que vitest no resuelve la
clave y el umbral lleva semanas sin comprobar nada.
- Corrige la ruta.
- Corre `pnpm test:coverage` y mira si ese fichero sigue al 100% o se cayo mientras el
  umbral estaba muerto.
- Si se cayo: escribe los tests que faltan, no bajes el umbral.
- Si hay mas claves de threshold apuntando a rutas inexistentes, arreglalas igual.

TAREA 2 — .env.example miente y deja la API sin arrancar
.env.example dice que LLM_BASE_URL y LLM_MODEL tienen valor por defecto. No lo tienen:
infrastructure/composition/llm.ts:36 los exige con requireConfig, asi que con
LLM_PROVIDER=openai y esas dos vacias la API muere al arrancar con
"Missing required configuration: LLM_BASE_URL".
Elige una de las dos y hazla bien:
  (a) darles valor por defecto en el codigo (https://api.openai.com/v1 y gpt-4o), o
  (b) corregir los comentarios de .env.example y ponerles un valor de ejemplo.
La (a) es mejor para quien clone el repo. Justifica la eleccion en el commit.

TAREA 3 — Documentacion desincronizada del codigo
Tres desvios, todos verificados:
- docs/tfm/04 §4.5 dice que el system prompt tiene 7 bloques.
  application/prompts/cognitiveDiagnosisPrompt.ts exporta 11: se anadieron
  ECU_LEARNING, SCOPE, CAPABILITY e INTERNALS.
- ADR-007 §3 dice 3 tablas en LanceDB.
  infrastructure/persistence/vector/vectorTableConfigs.ts declara 4: falta ecus_index.
- docs/tfm/04 §4.11 resume la criticidad como "reglas de umbrales". La regla real es
  DiagnosisResult.computeSeverity: 0 DTCs -> baja, con freeze frame -> critica,
  con DTCs sin freeze frame -> alta.
Corrige los tres documentos contra el codigo, no al reves.

TAREA 4 — ADR-001 no documenta alternativas consideradas
Es el unico ADR sin seccion de alternativas, y es el que mas se repregunta en una
defensa. Anade una seccion "Alternativas consideradas" con el mismo formato de tabla que
usan ADR-002 y ADR-007. Al menos: arquitectura orientada a eventos (descartada porque es
un solo proceso, el flujo es sincrono y anadiria broker y consistencia eventual sin ganar
nada), microservicios y MVC por capas. Contrasta cada razon con el codigo antes de
escribirla.

Al terminar cada tarea, actualiza docs/deuda-conocida.md remidiendo las cifras, que es lo
que pide la cabecera de ese fichero.
```
