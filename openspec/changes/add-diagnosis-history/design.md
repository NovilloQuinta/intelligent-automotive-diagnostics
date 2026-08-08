## Contexto

El informe de sesión ya se compone y se pinta bien. Lo que falta es memoria. Este documento recoge las decisiones que no son obvias al conectar la persistencia que quedó desconectada.

## Decisión 1: el historial guarda un snapshot, no datos normalizados

Se añade `resultJson` a `diagnosis_sessions` con el informe serializado, en lugar de normalizar DTCs, freeze frame y narrativa en tablas relacionadas.

**Por qué.** Un informe es un documento fechado, no una consulta viva. Si mañana ampliamos el catálogo SAE, corregimos una fórmula de PID o cambiamos el prompt del LLM, un informe normalizado se **reescribiría solo** y dejaría de reflejar lo que el mecánico vio y firmó. Eso es inaceptable en un documento que se entrega a un cliente. El snapshot es inmutable por construcción.

**Coste aceptado.** No se puede consultar "todos los coches que tuvieron P0301" con SQL sobre el JSON de forma eficiente. No hace falta hoy. Los campos por los que **sí** se filtra se desnormalizan como columnas propias: `severity` y `dtcCount`.

**Alternativa descartada.** Normalizar todo y versionar el catálogo. Mucho más trabajo, y resuelve un problema que no tenemos.

## Decisión 2: `vehicleId` pasa a ser opcional

Hoy `diagnosis_sessions.vehicleId` es `notNull` y referencia `vehicles`. **Ese FK no se puede satisfacer.** La tabla `vehicles` está vacía en la práctica: `seedScenarios.ts` es código muerto (nadie lo importa) y además asigna `UNASSIGNED_VEHICLE_ID = 0` a sus ECUs. Un diagnóstico en modo docker se identifica por `scenarioId`, y en modo TCP directo no hay ni escenario ni fila de vehículo.

Se hace `vehicleId` nullable y **la identidad del vehículo viaja dentro del snapshot** (VIN, marca, modelo, año). Es coherente con la Decisión 1: el informe debe conservar el coche tal como se identificó ese día, no como esté hoy en la base de datos.

Si más adelante se implementa un registro real de vehículos por VIN, el FK se rellena sin tocar los snapshots ya guardados.

## Decisión 3: el historial es por usuario

Se añade `userId` a la sesión y el listado filtra siempre por el usuario autenticado. No es una feature, es lo mínimo: la app se va a publicar y un mecánico no puede ver los diagnósticos de otro.

El endpoint **nunca** acepta un `userId` por parámetro — se toma del token, en el controlador. Un `userId` en la query es una vulnerabilidad de control de acceso (OWASP A01), no una comodidad.

## Decisión 4: guardar no puede tumbar el diagnóstico

`ProcessVehicleDiagnosisUseCase` abre la sesión antes de interrogar al vehículo y la cierra con el resultado al terminar. Si la escritura en base de datos falla, **se registra el error y se devuelve el diagnóstico igual**.

**Por qué.** El valor está en diagnosticar el coche; el historial es una comodidad. Un disco lleno no puede dejar a un mecánico sin lectura con el coche en el elevador. Y en la demo, un fallo de SQLite no puede romper la pantalla principal.

## Decisión 5: los filtros de fecha se resuelven en SQL, no en el navegador

El listado se pagina y se filtra en el servidor (`WHERE started_at BETWEEN ... LIMIT ... OFFSET ...`). Traerse el historial entero al cliente para filtrarlo funciona con 10 sesiones y se cae con 10.000.

Fechas en ISO 8601 UTC, igual que las escribe hoy `createSession` (`new Date().toISOString()`). Los atajos "hoy / 7 días / 30 días" son azúcar del frontend: calculan el rango y usan los mismos dos parámetros `from`/`to`.

## Decisión 6: una sola vista de informe

`SessionReportPanel` no se duplica. Se le añade la posibilidad de recibir un informe ya construido; si no lo recibe, se comporta exactamente como hoy y lo compone en vivo.

**Por qué.** Dos componentes que pintan lo mismo divergen a la primera semana. Y un informe guardado que se viera distinto al que se generó destruiría la confianza en el historial.

## Riesgos

- **La migración toca una tabla existente.** SQLite tiene soporte limitado de `ALTER TABLE`; verificar que Drizzle genera una migración válida y que arrancar con una base de datos previa no falla.
- **Tamaño del snapshot.** La narrativa del LLM más la traza de tools puede ocupar bastante. Medir con un informe real del Audi y, si se dispara, acotar qué partes del cognitivo se guardan.
- **Informes guardados antes de `fix-vehicle-identity-and-live-data`** conservarán la identidad de vehículo incorrecta para siempre — es la consecuencia lógica de un snapshot inmutable. Mergear este cambio después.
