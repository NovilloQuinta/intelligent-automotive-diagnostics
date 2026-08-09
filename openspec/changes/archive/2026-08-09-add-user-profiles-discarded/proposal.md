## Why

La aplicación tiene **dos públicos, no uno**: el mecánico de taller y la persona que se conecta desde su casa queriendo reparar su propio coche. Hoy los dos reciben exactamente la misma respuesta.

Y no es un problema de tono, es un problema de contenido. "P0301: fallo de encendido en el cilindro 1" es una respuesta completa para un profesional y es inútil para quien solo quiere saber si puede ir a trabajar mañana. Al revés también: explicarle a un mecánico qué es una bujía le hace perder el tiempo.

Hay además una diferencia que no es de comodidad sino de **seguridad**. Un mecánico sabe que el circuito de combustible está a presión, que un airbag puede dispararse, y que el cable naranja de un híbrido lleva alto voltaje suficiente para matar. Quien repara en casa no lo sabe. Un lector de códigos de 30 € escupe el mismo código a los dos por igual y no avisa a nadie.

Ahí está la aportación real: el sistema **sabe qué coche es** (identidad del vehículo, incluido si es híbrido) y **sabe quién pregunta**, y decide qué es seguro y útil decirle a cada uno. Eso es trabajo de la capa de IA, no de la interfaz.

## What Changes

- **Perfil en el usuario**: nuevo campo `profile` (`mechanic` | `owner`) en la tabla `users`, elegido al registrarse y cambiable después.
- **El perfil llega hasta el LLM**: se propaga desde el token hasta `ExecuteCognitiveDiagnosisUseCase`, formando parte del contexto con el que se construye la respuesta.
- **Respuestas distintas según el perfil**, sobre el mismo diagnóstico:
  - *mechanic*: código, componente, qué comprobar y en qué orden. Técnico y directo.
  - *owner*: si es grave, si puede conducir, si lo puede hacer él o debe ir al taller, qué pieza necesita, coste y dificultad aproximados, y los pasos.
- **Avisos de seguridad según el vehículo y el perfil**: en perfil *owner*, la respuesta incluye las advertencias que apliquen al vehículo concreto — alto voltaje en híbridos y eléctricos, combustible a presión, airbags, superficies calientes. En perfil *mechanic* no se repiten.
- **La IA declara en qué se basa**: distinguir lo que viene de la norma SAE, lo leído del vehículo en ese momento, lo recuperado de la base de conocimiento y lo que es inferencia del modelo.
- **Selector de perfil visible** para poder alternar entre ambas vistas sin cerrar sesión — es lo que permite enseñar las dos respuestas una al lado de la otra.

## Capabilities

### New Capabilities
- `user-profiles`: Perfil de usuario (mecánico profesional o particular) que condiciona el contenido, el nivel de detalle y las advertencias de seguridad de las respuestas del diagnóstico cognitivo.

### Modified Capabilities
- `execute-cognitive-diagnosis`: el caso de uso pasa a recibir el perfil del usuario como parte del contexto y a declarar el origen de cada afirmación.
- `auth-endpoints`: el registro acepta y persiste el perfil elegido.

## Dependencies

**Depende del chat conversacional** (`feat/mechanic-chat`), que debe estar mergeado: el perfil condiciona sobre todo las respuestas de la conversación, y sin caja de preguntas no hay dónde verlo.

Se apoya en `knowledge-confidence-validation` (archivado) para la parte de declarar el origen y la confianza de cada afirmación — revisar qué quedó implementado allí antes de construir nada nuevo.

Se apoya en la identidad del vehículo corregida en `fix-vehicle-identity-and-live-data`: sin saber que el Toyota es híbrido, no se puede avisar del alto voltaje.

## Impact

- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (+`profile` en `users`), nueva migración Drizzle
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/userRepository.ts`
- Modificado: controlador y rutas de autenticación (registro con perfil, cambio de perfil)
- Modificado: `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` (+perfil en el contexto)
- Modificado: construcción del prompt del diagnóstico cognitivo
- Nuevo: catálogo de advertencias de seguridad por tipo de vehículo, en `domain/`
- Modificado: `apps/ui/src/routes/login.tsx` y la pantalla de registro (selección de perfil)
- Modificado: `apps/ui/src/components/dashboard/` (selector de perfil y presentación diferenciada)
- Tests unitarios en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`
