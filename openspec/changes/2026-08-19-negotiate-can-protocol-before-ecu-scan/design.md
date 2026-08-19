## Contexto técnico

Lo verificado sobre `develop` (`5f82166`), no supuesto:

| Pieza | Estado |
|---|---|
| `initSequence.ts:23` | `ATZ/ATE0/ATL0/ATS1/ATH0/ATSP0/0100`. El `0100` fuerza la búsqueda de protocolo con timeout largo, así que **al terminar el init el protocolo ya está negociado y latcheado** |
| `ecuDiscovery.ts:9` | `AT E0/L0/H1/SP 6/SH 7DF` — impone CAN 11 bits antes del broadcast |
| `ecuDiscovery.ts:22` | Restore `AT H0` + `AT SH 7E0`. **No restaura `AT SP`** |
| `ecuDiscovery.ts:35` | `DISCOVERED_ECU_PROTOCOL = 'CAN_11_500'`, constante |
| `reliableTransport.ts:304` | El init se reejecuta en cada reconexión, pero solo si la conexión con el **dongle** se cae |
| `protocol.ts:241` | `CAN_HEADER_LINE_RE` = exactamente 3 dígitos hex |
| `protocol.ts:250` | `isObdResponseAddr` = rango `7E8–7EF` |
| `ecuAddressCatalog.ts:29,44` | Dirección de 3 dígitos; petición derivada como `respuesta − 8` |
| `EcuInfo` (`entities/ecuInfo.ts:9`) | Valida `/^[0-9A-Fa-f]+$/` — **sin límite de longitud** |
| `schema.ts:30,223` | `request_addr` / `response_addr` son `text`, **sin ancho** |
| `probe-serial.ts:182` | Ya pregunta `ATDPN` y lo imprime. Sonda manual, conexión propia, **no alimenta a la app** |

## D1 — Preguntar, no imponer

El init ya negocia con `ATSP0` y latchea el resultado con el `0100`. Cuando el barrido
emite `AT SP 6` está **descartando esa negociación** y sustituyéndola por una suposición.
En el 80% de los coches la suposición acierta y no se nota; en el resto rompe la sesión.

El barrido no necesita fijar el protocolo: necesita **saber cuál es** para elegir la
dirección de broadcast correcta. Así que `AT SP 6` sale de la secuencia y entra `AT DPN`
como primer comando, que es una consulta y no modifica nada.

Consecuencia deliberada: si el init no llegó a negociar (coche sin contacto, conector
flojo), `AT DPN` devuelve algo irreconocible y el barrido se abstiene. Es el
comportamiento correcto — antes, en esa misma situación, se emitían cinco comandos AT
sobre un bus que no estaba.

## D2 — Dónde vive la traducción del número de protocolo

Módulo nuevo `infrastructure/elm327/protocolNumber.ts`, puro y sin dependencias.

**No va en `domain/`** aunque sea lógica pura: la numeración `1..9/A` de `AT DPN` es una
convención del chip ELM327, no de la norma OBD. El criterio del proyecto ya está sentado en
`domain/obdServiceMode.ts:11`, que sí vive en dominio porque los bytes de modo son SAE y
"cualquier transporte futuro (Bluetooth, J2534) debe respetarla igual". Un J2534 no
entiende de `ATDPN`. Ver la skill `clean-architecture`.

Traduce a un descriptor con lo único que el barrido necesita:

| Nº | Familia | Broadcast funcional | Etiqueta `EcuInfo.protocol` |
|---|---|---|---|
| 6 | CAN 11 bits | `7DF` | `CAN_11_500` |
| 7 | CAN 29 bits | `18DB33F1` | `CAN_29_500` |
| 8 | CAN 11 bits | `7DF` | `CAN_11_250` |
| 9 | CAN 29 bits | `18DB33F1` | `CAN_29_250` |
| 1–5, A | pre-CAN / J1939 | ninguno | — |

Acepta el prefijo `A` (`'A6'`), que solo indica que el protocolo se negoció en automático,
y la respuesta sucia (`'A6\r\r>'`). Devuelve `null` ante lo irreconocible en vez de
adivinar. Reutiliza el patrón tabla `Readonly<Record<...>>` + resolución que ya usa
`domain/ecuAddressCatalog.ts:39`.

## D3 — CAN de 29 bits: qué cuesta de verdad

Medido antes de decidir, no estimado: **la entidad y la persistencia no se tocan**.
`EcuInfo` acepta los 8 dígitos y las columnas son `text` sin ancho. El ripple se queda en
el parser y el catálogo de direcciones.

Direccionamiento ISO 15765-4 de 29 bits, simétrico al de 11:

| Concepto | 11 bits | 29 bits |
|---|---|---|
| Broadcast funcional | `7DF` | `18DB33F1` |
| Petición física al ECM | `7E0` | `18DA10F1` |
| Respuesta del ECM | `7E8` | `18DAF110` |
| Derivar petición de respuesta | `respuesta − 8` | intercambiar los dos últimos bytes |

**El filtro de validez no puede ser un rango numérico.** En 11 bits el rango legislado es
estrecho (`7E8–7EF`, ocho ECUs) y por eso `isObdResponseAddr` funciona. En 29 bits la
dirección de la ECU es un byte sin ventana legislada equivalente, así que la regla pasa a
ser estructural: **la trama va dirigida al tester** (`18DAF1` + byte de ECU). Cualquier
otra cosa se descarta igual que hoy.

Del catálogo solo se estandariza el ECM, igual que en 11 bits: `18DAF110` → `18DA10F1`,
Engine Control Module. Todo lo demás sale `UNKNOWN` con su dirección. **Se mantiene la
regla de no inventar nombres** que ya fija el change de multi-ECU.

## D4 — El restore se queda en la dirección física del ECM

**Aquí me equivoqué en la primera versión de este diseño, y la verificación contra el
emulador lo destapó.** Sostuve que restaurar `AT SH 7E0` era un bug y que lo correcto era
dejar la dirección funcional, razonando que el init nunca emite `AT SH` y que por tanto el
estado previo era el valor de fábrica del adaptador (`7DF`).

El razonamiento sobre cuál es el valor de fábrica es correcto. La conclusión no. Medido
sobre una sola conexión al ELM327-emulator:

```
AT SH 7DF  →  01 0C  →  NO DATA
AT SH 7E0  →  01 0C  →  41 0C 0C 08
```

La dirección funcional sirve para **preguntar quién hay en el bus**, no para leer PIDs.
Dejarla puesta tumba la telemetría hasta la siguiente reconexión — exactamente el fallo que
este change venía a evitar, reintroducido por otra puerta.

Así que el restore mantiene `AT H0` + la dirección física del ECM (`7E0` u `18DA10F1`), que
es lo que hacía el código original. Lo único que estaba mal era el comentario, que llamaba
a `7E0` "el header por defecto": no lo es: es el destinatario que las lecturas necesitan.

**Consecuencia para la deuda**: esto invalida la hipótesis de que el restore explicaba el
`live-data devolvió null` de `docs/deuda-conocida.md`. Con el código anterior las lecturas
posteriores al barrido funcionan; se ha comprobado. La causa de aquel fallo sigue sin
identificar.

## D4b — El eco: por qué `AT DPN` no se puede leer aplanando la respuesta

Segundo hallazgo de la verificación, y solo aparece al levantar la aplicación. `AT DPN` es
ahora el **primer** comando del barrido, o sea que se emite antes de que `AT E0` apague el
eco. La respuesta real del adaptador es:

```
"AT DPN\rA6\r\r>"
```

Aplanarla da `"AT DPNA6"`, que no identifica ningún protocolo, así que el barrido se
abstiene **en un coche perfectamente capaz**. Por eso `resolveCanBus` recorre la respuesta
línea a línea en vez de limpiarla entera, que es lo que ya hace `stripEcho` para los modos
de datos.

Detalle que costó encontrar: la traza de `OBD_TRACE=true` **oculta el eco** —`flatten` en
`traceConsole.ts` descarta la línea igual al comando—, así que la traza mostraba `< A6` y el
parser recibía otra cosa. Los tests unitarios tampoco lo veían: guionizan la respuesta.

## D5 — Solo lectura forzada por el modo de conexión

`OBD_READ_ONLY` se mantiene, pero el valor efectivo se deriva:

```
readOnly = config.OBD_READ_ONLY || config.OBD_MODE !== 'docker'
```

Un único punto de derivación en `composition/diagnosis.ts`, consumido por los tres
cableados (`:78`, `:96`, `:121`).

**Por qué no invertir el default global a `true`**: el botón «Borrar averías» es parte de
la app y contra el emulador es inofensivo —el escenario se regenera al reiniciar el
contenedor—. Volcarlo a `true` en todos los modos obligaría a configurar el `.env` para
usar una función que en la demo web no tiene ningún riesgo. La distinción real no es la
variable, es **si hay un coche de verdad al otro lado del cable**, y eso lo dice `OBD_MODE`.

El mensaje de `UnsafeObdModeError` (`elm327Adapter.ts:250`) debe distinguir las dos causas
—variable puesta o modo de conexión— o parecerá un fallo en vez de una protección.

## Alternativas descartadas

- **Añadir solo `AT SP 0` al restore.** Una línea, arregla que el adaptador se quede
  clavado. Descartada porque deja intacto el problema de fondo: el barrido sigue rompiendo
  la sesión antes de recuperarla, y sigue sin saber con qué bus habla. Es curar el síntoma.
- **Soportar también los pre-CAN (1–5).** El broadcast por functional addressing no tiene
  equivalente directo en ISO 9141 / KWP; el descubrimiento ahí es otro mecanismo
  (direccionamiento por `AT SH` de tres bytes e inicialización propia). Mezclarlo en
  `discoverEcus` convertiría una función de 40 líneas en dos algoritmos distintos con un
  `if` en medio. Si algún día hace falta, es otro change.
- **Derivar el protocolo del VIN o del año del vehículo.** Sería inventar el dato pudiendo
  leerlo. El adaptador ya lo sabe: basta preguntárselo.

## Validación pendiente

No hay en este entorno ni coche de 29 bits ni coche pre-CAN. Lo que se puede verificar:

- Contra el emulador (protocolo 6, `OBD_TRACE=true`): que sale `AT DPN`, que **no** sale
  `AT SP 6`, y que el barrido sigue devolviendo las cinco ECUs del escenario Audi.
- Todo lo demás, por test unitario con transporte guionizado.

Lo que queda respaldado solo por la norma ISO 15765-4 y no por una prueba empírica: el
direccionamiento de 29 bits. Debe decirse así en el mensaje de commit y al usuario, no
darse por probado.

## Orden y riesgo

D2 es aditivo y aislado: entra primero, sin tocar nada existente. D3 (parser + catálogo) es
independiente de D4 (secuencia del barrido) y ambos son de bajo riesgo por estar cubiertos
de tests. D5 no comparte fichero con ninguno de los anteriores. El único cambio con riesgo
de regresión visible es D4, y su red de seguridad son los 8 tests que ya tiene
`ecuDiscovery.test.ts`.
