# Prompt para opencode — Modos OBD que faltan

Copia todo lo que hay debajo de la línea y pégalo en opencode.

**Lánzalo cuando `fix/vehicle-identity-and-live-data` esté mergeado en `develop`**, no antes: los dos tocan `elm327Adapter.ts` a fondo y chocarían.

---

Lee `AGENTS.md` antes de nada y sigue sus reglas de sesión (orquestar antes de actuar, TDD estricto, rama desde `develop`, preguntar antes de commitear).

## Objetivo

La app enseña hoy una única lista de averías y no deja hacer nada con ellas. Cualquier máquina de taller hace tres cosas más que son básicas. Este cambio las añade. **Las tres van juntas en un solo cambio porque comparten los mismos ficheros** — no las separes en ramas distintas.

Rama: `feat/obd-standard-modes`, desde `develop`.

## 1. Borrar códigos de avería (Mode 04)

- `Elm327TcpRepository.clearDtcCodes()` **ya existe** (`infrastructure/elm327/elm327Adapter.ts`) y manda `04`. Lo que no existe es endpoint ni botón.
- Añadir `POST /api/clear-dtc` siguiendo el patrón de los demás en `DiagnosisController` (schema Zod con `scenarioId` required/optional según `isDirectConnection`, ruta, swagger, rate limit).
- UI: botón en el panel de DTC, **con diálogo de confirmación**. Borrar no es una acción reversible.
- El aviso al usuario debe decir la verdad de lo que pasa al borrar, porque es lo que hace un equipo real:
  - Se borran las averías almacenadas **y su freeze frame** — se pierde la evidencia de lo que falló.
  - Se reinician los monitores de emisiones: el coche queda "no listo" y no pasaría una inspección hasta completar ciclos de conducción.
  - **Las averías permanentes (Mode 0A) NO se borran** con esto. Solo desaparecen cuando la centralita verifica que el fallo ya no ocurre.
- Tras borrar, refrescar el diagnóstico para que la pantalla refleje el estado nuevo.

## 2. Testigo del motor y monitores de emisiones (Mode 01 PID 01)

- Nuevo método en el adaptador para leer `01 01`, que devuelve 4 bytes:
  - Byte A, bit 7: testigo MIL encendido o apagado.
  - Byte A, bits 0-6: número de averías almacenadas.
  - Bytes B, C, D: monitores de emisiones — cuáles soporta el vehículo y cuáles ha completado.
- Nuevo endpoint `GET /api/vehicle-status?scenarioId=`.
- UI: panel nuevo con el testigo (encendido/apagado, bien visible), el número de averías, y la lista de monitores con su estado.
- Los monitores dependen del tipo de motor: los de encendido por chispa (gasolina) y los de compresión (diésel) no son los mismos. El byte B lo indica. Modélalo bien, es lo que distingue una lectura real de una de juguete.
- **Esto es lo que mira una ITV.** Si todos los monitores están completos y no hay MIL, el coche pasaría. Mostrarlo así es muy vistoso y es real.

## 3. Averías pendientes (Mode 07) y permanentes (Mode 0A)

- Un equipo real muestra tres listas, no una:
  - **Almacenadas** (Mode 03) — ya lo tienes.
  - **Pendientes** (Mode 07) — fallo detectado una vez, aún sin confirmar. Todavía no enciende el testigo.
  - **Permanentes** (Mode 0A) — confirmadas, y solo la centralita puede quitarlas.
- El parser es el mismo que ya usa Mode 03 (`parseDtcResponse` + `DtcCode.decodeFromBytes`). **Reutilízalo, no lo dupliques.**
- Todas resuelven su descripción con el catálogo `domain/dtcCatalog.ts` igual que las almacenadas.
- UI: tres secciones en el panel de DTC, cada una con su explicación breve de qué significa. Una sección vacía se muestra como vacía, no se oculta — que no haya pendientes es información.

## Emuladores

Los escenarios de `docker/elm327/scenarios/` no responden hoy a `01 01`, `07`, `0A` ni `04`. Hay que añadirlos:

- **Audi** (`audi_a3_tdi.py`): es el vehículo con averías. MIL encendido, 3 almacenadas, algún monitor incompleto, al menos una pendiente y una permanente. Es el que se enseña en la demo.
- **Kawasaki** (`kawasaki_z900.py`) y **Toyota**: sin averías, MIL apagado, monitores completos. Sirven de contraste.
- `04` debe responder confirmación positiva.

Un emulador no cambia de estado al recibir `04` — devuelve siempre la misma respuesta fija. Que la UI refresque tras borrar seguirá mostrando las mismas averías, y **eso es esperado**. Déjalo anotado en el reporte para que no se interprete como un fallo.

## Restricciones

- **TDD estricto**: RED → GREEN → REFACTOR.
- **No instalar librerías de terceros.** Si crees que hace falta una, para y pregunta.
- **No commitear ni pushear sin OK humano** (regla 7). **No mergear a `develop`** salvo petición explícita.
- **Solo lectura sobre el vehículo, salvo el Mode 04 de este cambio.** Nada de escribir en centralitas, activar actuadores ni rutinas.
- Reutiliza lo que ya existe: `parseDtcResponse`, `DtcCode`, `dtcCatalog`, el patrón de endpoints de `DiagnosisController`. Si te ves duplicando lógica de parseo, para y extrae.
- Deuda conocida: `pnpm lint` de `apps/ui` falla por el override de `brace-expansion` (ver `AGENTS.md`). No lo arregles, está fuera de alcance.

## Al terminar

Para e indica al usuario qué comprobar en la UI, sobre el Audi:
- Testigo encendido, 3 averías, monitores incompletos.
- Tres listas de averías, cada una con sus códigos y descripciones.
- Botón de borrar que pide confirmación y avisa de lo que se pierde.
- En la Kawasaki: testigo apagado, monitores completos, tres listas vacías.
