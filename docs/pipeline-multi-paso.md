# Pipeline multi-paso

> Extraido de `AGENTS.md` para no cargarlo en el contexto de cada agente.
> Cargalo solo cuando vayas a ejecutar un pipeline con review gates.

El modo pipeline permite ejecutar tareas de forma secuencial con review gates entre
cada paso: writer → reviewer → (corregir si FAIL) → siguiente tarea.

## Coste

Cada salto del pipeline arranca un sub-agente **en frio**: vuelve a pagar
`AGENTS.md` + skills + definicion de agente (~8.5k tokens) y vuelve a leer los
ficheros que ya leyo el agente anterior. Un pipeline de 4 saltos son ~34k tokens
de preambulo repetido. Usalo para cambios grandes y multi-modulo, no para
tareas de 1-2 ficheros.

## Activación

Usa keywords como `pipeline`, `multi-paso`, `paso a paso`, `con revisión`,
`review gate`, o `tdd con review`. El `@orchestrator` detecta estas keywords y
emite un JSON con `mode: "pipeline"` y un `pipeline_plan`.

## Flujo

```
Usuario: "implementa las tareas con pipeline"
           ↓
   @orchestrator (mode: pipeline)
     - Diseña pipeline_plan con steps alternados (implement → review → ...)
     - Guarda plan en .opencode/pipeline-state.json
     - Emite step 1 → delega a @writer
           ↓
   @writer (modo pipeline — 1 módulo)
     - Implementa task del step actual
     - Reporta con ---pipeline_context---
           ↓
   @orchestrator (re-invocación)
     - Lee pipeline-state.json + evalúa gate
     - Si gate_after: emite step review → delega a @reviewer
           ↓
   @reviewer (modo pipeline — solo files_to_review)
     - Revisa archivos indicados
     - Reporta con ---gate_result---
           ↓
   @orchestrator (evalúa gate)
     - FAIL (violaciones graves) → re-emite step implement (misma task)
     - PASS_WITH_WARNINGS → emite siguiente step (con warnings)
     - PASS → emite siguiente step
           ↓
   ... (ciclo se repite hasta completar pipeline_plan)
           ↓
   @orchestrator elimina pipeline-state.json → pipeline completado
```

## Review Gate Decision Tree

| gate_result.result | Condición | Acción |
|---|---|---|
| `FAIL` | Violaciones graves > max_grave_violations | Re-implementar misma task |
| `PASS_WITH_WARNINGS` | graves = 0, warnings > 0 pero <= max_warnings | Avanzar (con warnings en payload) |
| `PASS` | graves = 0, warnings = 0 | Avanzar |

## Archivo de estado

- **`.opencode/pipeline-state.json`**: creado por el orquestador al iniciar pipeline,
  eliminado al completar. Contiene `pipeline_plan`, `current_step`, `completed_steps`,
  `gate_results`, y timestamps.

## Reglas de delegación

- **1 tarea = 1 agente en 1 step.** No se delegan múltiples agentes en paralelo.
- **Pipeline secuencial SÍ está permitido**: un agente tras otro, con review gates validados por el orquestador.
- Si un sub-agente se desvía de su fase (ej. writer intenta revisar), el orquestador cancela y re-enruta.
- **Pasa los ficheros ya leidos en el payload.** Si el writer ya leyo `foo.ts`,
  el handoff al reviewer debe nombrar los ficheros y el rango de lineas tocadas,
  para que el reviewer no relea el modulo entero.
