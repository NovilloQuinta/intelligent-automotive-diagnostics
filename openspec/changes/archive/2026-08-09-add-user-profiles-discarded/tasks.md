## 0. Preparación

- [ ] 0.1 **Comprobar que el chat conversacional está mergeado en `develop`.** Sin caja de preguntas, el perfil no tiene dónde verse
- [ ] 0.2 **Revisar `openspec/changes/archive/2026-08-07-add-knowledge-confidence-validation/`** y el código resultante: buena parte del andamiaje para declarar origen y confianza puede existir ya. No reimplementar
- [ ] 0.3 Crear `feat/user-profiles` desde `develop`
- [ ] 0.4 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [ ] 0.5 Cargar contexto: este `proposal.md`/`design.md`, `schema.ts` (tabla `users`), `userRepository.ts`, rutas y controlador de auth, `ExecuteCognitiveDiagnosisUseCase.ts`, construcción del prompt cognitivo, `VehicleInfo`
- [ ] 0.6 Comprobar si `VehicleInfo` distingue hoy que un vehículo es híbrido. Si no, es requisito previo del punto 3 — resolverlo ahí y no en el modelo

## 1. Perfil en el usuario

- [ ] 1.1 RED: test — registrarse con perfil `owner` lo persiste
- [ ] 1.2 GREEN: campo `profile` en `users` + migración Drizzle + repositorio
- [ ] 1.3 RED: test — registro sin perfil asigna `owner` por defecto
- [ ] 1.4 RED: test — un perfil fuera del conjunto permitido responde 400 y no crea usuario
- [ ] 1.5 GREEN: validación Zod del conjunto cerrado
- [ ] 1.6 RED: test — cambio de perfil de un usuario autenticado queda persistido
- [ ] 1.7 GREEN: endpoint de cambio de perfil
- [ ] 1.8 Verificar que arrancar contra una base de datos existente no falla y los usuarios previos reciben el valor por defecto
- [ ] 1.9 REFACTOR: con la suite en verde

## 2. Propagación del perfil

- [ ] 2.1 RED: test — el perfil del usuario autenticado llega a `ExecuteCognitiveDiagnosisUseCase`
- [ ] 2.2 GREEN: propagar desde el controlador hasta el caso de uso
- [ ] 2.3 RED: test — un perfil enviado en el cuerpo distinto al del usuario no se acepta sin validar
- [ ] 2.4 GREEN: resolución en servidor + validación
- [ ] 2.5 RED: test — el perfil no altera qué endpoints puede usar cada usuario
- [ ] 2.6 REFACTOR: con la suite en verde — comprobar que el caso de uso sigue sin depender de `infrastructure/`

## 3. Catálogo de advertencias de seguridad

- [ ] 3.1 Si `VehicleInfo` no distingue híbrido/eléctrico, añadirlo primero — el catálogo depende de ese dato estructurado
- [ ] 3.2 RED: test — un vehículo híbrido produce la advertencia de alto voltaje
- [ ] 3.3 GREEN: catálogo en `domain/` indexado por características del vehículo
- [ ] 3.4 RED: test — la advertencia se incorpora aunque la respuesta del modelo no la mencione
- [ ] 3.5 GREEN: incorporación determinista, fuera del criterio del modelo
- [ ] 3.6 RED: test — con perfil `mechanic` no se repiten las advertencias básicas
- [ ] 3.7 RED: test — una reparación sobre alto voltaje, airbags o combustible a presión, con perfil `owner`, deriva al taller y no devuelve pasos
- [ ] 3.8 GREEN: implementar la derivación
- [ ] 3.9 REFACTOR: con la suite en verde — comprobar que el catálogo no importa nada de `infrastructure/`

## 4. Respuestas diferenciadas

- [ ] 4.1 RED: test — con perfil `mechanic`, la respuesta cubre código, componente y comprobaciones ordenadas
- [ ] 4.2 RED: test — con perfil `owner`, la respuesta cubre gravedad, si puede conducir, si puede repararlo él, pieza, coste aproximado, dificultad y pasos
- [ ] 4.3 GREEN: construcción del prompt según perfil, **compartiendo todo lo común** y con la diferencia en un único sitio
- [ ] 4.4 RED: test — los datos subyacentes (códigos, valores, severidad) coinciden entre ambos perfiles
- [ ] 4.5 Mockear el cliente LLM en todos los tests. **Sin llamadas reales a la API en la suite**
- [ ] 4.6 REFACTOR: con la suite en verde — verificar que no hay dos ramas de prompt que puedan divergir

## 5. Origen de la información

- [ ] 5.1 Partiendo de lo revisado en 0.2, RED: test — una descripción del catálogo SAE se identifica como tal
- [ ] 5.2 RED: test — un valor leído de un PID en la sesión se identifica como lectura del vehículo
- [ ] 5.3 RED: test — una hipótesis sin respaldo se identifica como inferencia
- [ ] 5.4 GREEN: implementar lo que falte respecto a lo ya existente
- [ ] 5.5 REFACTOR: con la suite en verde

## 6. UI

- [ ] 6.1 RED: test — la pantalla de registro permite elegir perfil y lo envía
- [ ] 6.2 GREEN: selección de perfil en el registro
- [ ] 6.3 RED: test — el selector del dashboard refleja el perfil almacenado al entrar
- [ ] 6.4 RED: test — cambiar el selector regenera la respuesta con el contenido del nuevo perfil
- [ ] 6.5 GREEN: selector de perfil
- [ ] 6.6 RED: test — el origen de la información se muestra de forma distinguible en la respuesta
- [ ] 6.7 GREEN: presentación del origen
- [ ] 6.8 REFACTOR: con la suite en verde

## 7. Verificación manual

- [ ] 7.1 Mismo Audi con P0301, consultado con los dos perfiles: comprobar que las respuestas son realmente distintas en contenido, no solo en tono
- [ ] 7.2 Toyota híbrido con perfil `owner`: comprobar que aparece la advertencia de alto voltaje
- [ ] 7.3 Toyota híbrido con perfil `mechanic`: comprobar que no se repiten las advertencias básicas
- [ ] 7.4 Leer las respuestas de perfil `owner` con ojo crítico: que no suenen condescendientes y que el coste se presente como orden de magnitud, nunca como presupuesto cerrado
- [ ] 7.5 Anotar los pares de respuestas en el reporte — es material directo para la memoria del TFM

## 8. Cierre

- [ ] 8.1 `@security` sobre el perfil: confirmar que en ningún punto se usa como mecanismo de autorización
- [ ] 8.2 `@reviewer` sobre el diff completo
- [ ] 8.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, también `pnpm test:ui`
- [ ] 8.4 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 8.5 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 8.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
