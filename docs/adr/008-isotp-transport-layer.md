# ADR 008: Capa de Transporte ISO-TP (ISO 15765-2)

**Estado:** Propuesto — **no implementado, y descartado para el alcance del TFM**
**Fecha:** 2026-08-01 | **Revisado:** 2026-08-18
**Contexto:** El proyecto necesita leer el VIN (Service 09 PID 02) que produce 19 bytes de payload, excediendo los 7 bytes útiles de un Single Frame CAN.

---

> **Aviso de estado (revisión 2026-08-18).** Nada de lo que describe este ADR existe en el código:
> no hay `infrastructure/obd/isotp/`, ni `frameTypes.ts`, ni `reassembler.ts`, ni `segmenter.ts`, ni
> tests asociados. Se conserva como registro de una decisión que **se evaluó y se descartó**, no
> como trabajo pendiente ni como funcionalidad entregada.
>
> **La premisa del ADR resultó ser falsa.** El documento afirma que implementar ISO-TP es
> "obligatorio" para hablar con el emulador ELM327 o con un vehículo real. No lo es: el chip ELM327
> *ya* implementa ISO-TP: segmenta, reensambla y gestiona el flow control por su cuenta, y expone el
> resultado como líneas de texto ASCII en hexadecimal. Por eso `readVin()` se reduce a enviar
> `09 02` y parsear la respuesta con `parseVinResponse`, sin ver jamás un PCI byte ni una
> Consecutive Frame. Lo que sí hizo falta fue `ATS1` en la negociación de la sesión, para que el
> adaptador separe los bytes con espacios y el parser multilínea pueda leerlos.
>
> Implementar ISO-TP solo volvería a ser necesario bajando por debajo del ELM327 — un transporte
> SocketCAN o J2534 hablando CAN crudo. Queda como trabajo futuro si el proyecto llega ahí.

## Contexto

El diagnóstico vehicular OBD-II sobre CAN Bus (ISO 15765-4) utiliza ISO 15765-2 (ISO-TP) como capa de transporte cuando el payload supera los 7 bytes. El proyecto carece de esta capa:

- El simulador (`ObdSimulator.getVin()`) devuelve el VIN como string directo sin pasar por CAN frames.
- El decoder `decodeVin()` existe pero ningún flujo de producción lo invoca con bytes reales.
- Para conectar con el emulador ELM327 Docker (ADR 004) o un vehículo real, es obligatorio implementar ISO-TP.

ADR 004 menciona explícitamente "ISO-TP flow control" como capacidad objetivo del futuro `infrastructure/elm327-simulator/`. Este ADR establece la decisión de implementar ISO-TP como módulo independiente y puro, antes de integrarlo en el simulador.

## Decisión

**Implementar ISO-TP como módulo puro en `infrastructure/obd/isotp/`.** El módulo consiste en:

1. **Tipos de trama CAN** (`frameTypes.ts`): enums, interfaces y funciones `parsePci`/`buildPci` para codificar/decodificar el PCI byte.
2. **Reassembler** (`reassembler.ts`): recibe frames CAN con PCI y reensambla el payload completo. Soporta Single Frame y Multi-Frame (FF → CFs). Valida secuencia, overflow (>4095 bytes) y truncamiento.
3. **Segmenter** (`segmenter.ts`): segmenta un payload en frames CAN (SF si cabe en uno, FF+CFs si requiere multi-frame).

Principios de diseño:

- **Funciones puras**: operan sobre `number[]`, sin I/O, sin TCP, sin ELM327, sin dependencias externas.
- **Capa infraestructura aislada**: no depende de `domain`, `application` ni `http` (Clean Architecture).
- **MTU parametrizable**: por defecto 8 (CAN clásico), configurable para CAN FD (64 bytes).
- **Zero overhead de dependencias**: no usa `Buffer` de Node.js, solo `number[]` para portabilidad.

## Consecuencias

### Positivas

- El reassembler permite leer VINs y otros payloads multi-frame desde cualquier adaptador OBD.
- El segmenter permite construir requests OBD correctamente formateadas.
- Tests unitarios exhaustivos (24 casos entre frameTypes, reassembler y segmenter) cubren edge cases reales.
- El módulo es reutilizable tanto en el adaptador TCP (`Elm327TcpRepository`) como en el futuro simulador TypeScript.
- Sigue el patrón de `pidParser.ts` y `vinDecoder.ts`: funciones puras en `infrastructure/obd/`, sin acoplamiento.

### Negativas

- No implementa la sesión ISO-TP completa (state machine con timers N_As, N_Bs, N_Cr). Los timeouts son responsabilidad del caller.
- El segmenter no implementa negociación de Flow Control (BS/STmin). Suficiente para requests (caben en SF).
- No maneja direccionamiento CAN (IDs 7E0/7E8) — esa responsabilidad es de la capa superior.

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **Delegar ISO-TP al ELM327 Python** (emulador Docker) | El emulador maneja ISO-TP internamente, pero depender de él rompe la arquitectura: nuestro código nunca aprende a parsear/resegmentar frames. Inviable para producción con vehículo real. |
| **Biblioteca externa** (ej. `can-isotp` de npm) | No existe una biblioteca npm madura para ISO-TP en Node.js. Añadir dependencia para una capa de ~200 líneas es innecesario. |
| **Implementar en `infrastructure/elm327-simulator/`** | ISO-TP es agnóstico al medio (TCP, CAN raw). Separarlo permite reutilizarlo en el adaptador TCP, el simulador TypeScript, y futuros conectores CAN. |
| **Implementar solo el reassembler** (sin segmenter) | El segmenter es necesario para construir requests multi-frame (envío de datos largos). Implementar solo recepción sería incompleto. |

## Referencias

- ADR 004: `004-elm327-emulador-docker.md` — emulador ELM327 como referencia, menciona ISO-TP como capacidad objetivo.
- [ISO 15765-2:2016](https://www.iso.org/standard/66574.html) — Road vehicles — Diagnostic communication over CAN (DoCAN) — Transport protocol and network layer services.
- `infrastructure/obd/pidParser.ts` — patrón de funciones puras en infraestructura sin dependencias externas.
- `infrastructure/obd/vinDecoder.ts` — decoder de VIN que será consumidor del payload reensamblado.
