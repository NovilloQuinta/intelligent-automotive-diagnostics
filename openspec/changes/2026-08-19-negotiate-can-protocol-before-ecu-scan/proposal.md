## Why

El barrido de ECUs **impone** el protocolo del bus en vez de preguntarlo, y no deshace lo
que impone. `ECU_SCAN_INIT_SEQUENCE` (`ecuDiscovery.ts:9`) emite `AT SP 6` —CAN 11 bits /
500 kbps— y `ECU_SCAN_RESTORE_SEQUENCE` (`:22`) restaura `AT H0` y `AT SH 7E0`, pero **no
el protocolo**. Tres consecuencias, todas verificadas sobre el código:

- **En un coche que no sea protocolo 6, el barrido tumba la sesión entera.** Que el barrido
  falle es inevitable con el parser actual; lo que no lo es: el adaptador se queda hablando
  un idioma que el coche no entiende, así que a partir de ahí fallan también la telemetría,
  los DTC y el VIN — lecturas que sí funcionarían, porque el `ATSP0` del init
  (`initSequence.ts:23`) ya las había negociado bien.
- **No se recupera solo.** El init se reejecuta al reconectar (`reliableTransport.ts:304`),
  pero aquí el socket con el dongle sigue vivo: lo que está muerto es el enlace con el
  coche. Hay que reiniciar el proceso.
- **El comentario del restore es incorrecto**, aunque el comando sí lo era: el código deja
  `AT SH 7E0` diciendo que es "el header por defecto", y no lo es —el valor de fábrica del
  ELM327 es `7DF`—. Es, eso sí, el destinatario que las lecturas necesitan: verificado
  contra el emulador, con `7DF` puesto un `01 0C` responde `NO DATA`. Se corrige el
  comentario, no el comando.

Además, `DISCOVERED_ECU_PROTOCOL` (`:35`) está fijo a `'CAN_11_500'`: toda ECU descubierta
se persiste con esa etiqueta aunque el bus sea otro.

**La detección ya existe, pero fuera de la aplicación.** `scripts/probe-serial.ts:182`
pregunta `ATDPN` y lo imprime por consola; su propia cabecera dice que no reutiliza el
transporte de la app a propósito. Es una sonda de mano. El código que habla con el coche
nunca pregunta.

Y un segundo hueco del mismo hilo, el único que puede dejar huella en el vehículo: **el
borrado de DTC viene habilitado por defecto**. `OBD_READ_ONLY` es `false`
(`configuration/index.ts:11`), y Mode 04 es irreversible en un coche real —borra códigos,
freeze frames y reinicia los monitores de emisiones—. Hoy depende de acordarse de ponerlo
a `true` en el `.env`, cosa que `docs/guion-demo.md:159` avisa pero el código no impone.

## What Changes

- **La app pregunta `AT DPN` antes de barrer** y deja de emitir `AT SP`. El protocolo lo
  negocia el init con `ATSP0`; el barrido se limita a leer cuál salió.
- **Cobertura de los cuatro protocolos CAN** (6, 7, 8 y 9), que es todo vehículo con OBD-II
  de 2008 en adelante. El 29 bits usa broadcast funcional `18DB33F1` y respuestas
  `18DAF1xx`, con la dirección de petición derivada intercambiando bytes en vez de restando 8.
- **En pre-CAN (protocolos 1–5) o respuesta irreconocible, el barrido se abstiene**:
  devuelve `[]` sin emitir un solo comando AT. Es lo que evita tumbar las lecturas que sí
  funcionan en esos coches.
- **El restore deja la dirección física del ECM del protocolo detectado** (`7E0` en 11 bits,
  `18DA10F1` en 29), que es la que las lecturas necesitan.
- **`EcuInfo.protocol` refleja el bus real** (`CAN_11_500`, `CAN_29_500`, `CAN_11_250`,
  `CAN_29_250`) en vez de una constante.
- **Solo lectura forzada con un coche real conectado**: `OBD_MODE=serial` o `tcp` implica
  `readOnly` sea cual sea `OBD_READ_ONLY`. Con el emulador no cambia nada.

## Non-goals

- **No se barren los pre-CAN (1–5)**. El broadcast por functional addressing no existe como
  tal en ISO 9141 / KWP / J1850; el parser y el catálogo son CAN por diseño. Se abstienen
  de forma explícita, que es distinto de fallar.
- **No se amplía el rango legislado** (ABS en 7B0/7B8, A/C en 7C4/7CC). Sigue siendo otra
  decisión, como ya dejó dicho el change de multi-ECU.
- **No se toca `createReliableTransport`**: que no se recupere tras 30 s caído es deuda
  conocida y aparte.
- **No se retira el borrado de DTC de la UI**: contra el emulador sigue funcionando igual.

## Capabilities

### Modified Capabilities
- `ecu-discovery-and-system-catalog`: el barrido negocia el protocolo con el vehículo en
  vez de imponerlo, cubre los cuatro buses CAN, se abstiene en los pre-CAN y devuelve el
  adaptador al estado en que lo encontró.
- `elm327-tcp-repository`: la política de solo lectura deja de depender de una variable de
  entorno cuando hay un vehículo real conectado.

## Dependencies

Ninguna. Se basa en `develop` tal cual (`5f82166`).

## Impact

- **`infrastructure/elm327/`**: módulo nuevo `protocolNumber.ts` (puro, traduce la respuesta
  de `AT DPN`), `ecuDiscovery.ts` reescrito en su secuencia, y `protocol.ts` con
  `parseCanHeaders` aceptando headers de 29 bits.
- **`domain/ecuAddressCatalog.ts`**: `resolveEcuAddress` acepta los dos anchos de dirección.
- **Sin cambios en entidad ni persistencia** — medido, no supuesto: `EcuInfo` valida con
  `/^[0-9A-Fa-f]+$/`, sin límite de longitud, y `schema.ts:30,223` declara
  `request_addr`/`response_addr` como `text` sin ancho.
- **`infrastructure/composition/diagnosis.ts`**: el valor efectivo de solo lectura se deriva
  del modo de conexión. Los tres puntos que hoy leen `config.OBD_READ_ONLY` (`:78`, `:96`,
  `:121`) pasan a leer el derivado.
- **Documentación**: `.env.example`, tabla de entorno del `README.md`, el aviso de
  `docs/guion-demo.md:177-178` (que queda falso), el capítulo 3.4 del TFM y el ADR 009.
- **Riesgo residual**: no hay coche de 29 bits ni pre-CAN contra el que probar en este
  entorno. Esa parte queda respaldada por tests y por el direccionamiento ISO 15765-4, no
  por una prueba empírica. Ver "Validación pendiente" en `design.md`.
