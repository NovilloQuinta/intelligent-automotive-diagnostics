# Prompt para opencode — Chat con el mecánico

Copia todo lo que hay debajo de la línea y pégalo en opencode.

**Lánzalo cuando los 5 arreglos de `prompt-opencode.md` estén verificados**, no antes.

---

Lee `AGENTS.md` antes de nada y sigue sus reglas de sesión (orquestar antes de actuar, TDD estricto, rama desde `develop`, preguntar antes de commitear).

## Objetivo

El mecánico tiene que poder preguntarle al sistema en lenguaje natural ("el coche tira poco cuesta arriba", "¿por qué se calienta?") y que la IA consulte el vehículo para responder. Esto se pidió el 2 agosto 2026, se implementó, y se borró ese mismo día en un desarrollo que salió mal. Nunca se rehízo. **Es requisito de la demo, no un extra.**

## Lo que YA existe — no lo reimplementes

Comprueba esto antes de escribir una línea:

- **La IA ya sabe leer el coche por su cuenta.** El servidor MCP expone la tool `read_pid` (constante `READ_PID_TOOL` en `mcpToolNames.ts`) y el LLM decide qué PIDs leer. Se mergeó el 7 agosto como `add-cognitive-pid-discovery`.
- **El endpoint ya acepta la pregunta del usuario**: `POST /api/mcp/cognitive-diagnosis` valida `{ scenarioId, query?: string }` en `DiagnosisController.cognitiveDiagnosis`, y `DiagnosisService.cognitiveDiagnosis({ scenarioId, userQuery })` la propaga hasta `ExecuteCognitiveDiagnosisUseCase.execute({ userQuery, vehicleContext })`.
- **El historial de conversación ya está tipado** en el puerto del LLM: `LlmMessageInput.conversationHistory?: readonly LlmConversationItem[]`, y los clientes de Anthropic y OpenAI ya lo siembran en el array de mensajes.
- **La UI ya llama al endpoint** desde `apps/ui/src/components/dashboard/useCognitiveDiagnosis.ts`, cuyo `trigger(query?)` acepta la pregunta... pero `DashboardPage.tsx:54` lo invoca como `cognitive.trigger()`, sin nada. La pregunta nunca llega.

Es decir: la tubería está entera y le falta la boca de entrada.

## Alcance de este cambio

**Sí entra:**

1. **Caja de texto en el dashboard** para que el mecánico escriba su pregunta, con su botón de enviar y estado de carga (la respuesta puede tardar hasta 60 s — el timeout ya existe).
2. **La pregunta llega al endpoint**: pasar el texto por `trigger(query)`.
3. **Mostrar la respuesta de la IA** en pantalla, no solo las filas de PIDs que ya se pintan hoy.
4. **Hilo de conversación en memoria de sesión**: el mecánico repregunta ("¿y eso por qué?") y la IA mantiene el contexto. Añadir `history` al cuerpo del endpoint y propagarlo hasta `conversationHistory`, que ya existe en el puerto. Se pierde al recargar la página, y es aceptable.

**No entra:**

- Persistencia en base de datos (la tabla `diagnostic_messages` no existe en `schema.ts` y no hace falta para la demo).
- Descripciones de DTC propuestas por IA con aceptar/rechazar — cambio aparte, decidido para después.
- Cualquier cosa que escriba en el vehículo. Solo lectura.

## Restricciones

- **TDD estricto**: RED → GREEN → REFACTOR.
- **No instalar librerías de terceros.** Si crees que hace falta una, para y pregunta. (`serialport` está autorizada pero es para otro cambio, no para éste.)
- **No commitear ni pushear sin OK humano** (regla 7).
- **No mergear a `develop`** salvo petición explícita.
- Rama propia desde `develop`.
- El diagnóstico cognitivo es opcional por diseño: sin `LLM_PROVIDER` configurado, `GET /api/mcp/capabilities` devuelve `cognitiveDiagnosis: false` y la UI debe ocultar la caja de texto en vez de enseñar un chat que no responde.
- Rate limit del endpoint cognitivo: 5 peticiones/minuto. Ten en cuenta que ahora el usuario lo disparará a mano y repetidamente — comprueba que el límite no corta una conversación normal y, si corta, dilo antes de cambiarlo.
- Cada respuesta del LLM cuesta dinero real. No hagas pruebas exploratorias contra la API: mockea el cliente LLM en los tests y deja una única verificación manual de extremo a extremo al final.

## Al terminar

Para e indica al usuario qué comprobar en la UI:
- Escribir una pregunta sobre un vehículo con avería (el Audi) y ver que la IA responde consultando datos reales del coche.
- Repreguntar sobre esa misma respuesta y comprobar que mantiene el hilo.
- Con el LLM sin configurar, comprobar que la caja no aparece y el resto del dashboard funciona igual.

Antes de crear el cambio OpenSpec, revisa `openspec/changes/archive/` — el diseño original de `add-multi-turn-diagnostic-sessions` puede seguir ahí y ahorrarte trabajo de planificación.
