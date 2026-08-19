# ADR 009: Negociación del protocolo OBD y alcance del barrido de ECUs

**Estado:** Aceptado — **implementado**
**Fecha:** 2026-08-19
**Contexto:** El barrido de ECUs imponía el protocolo del bus en vez de preguntarlo, y no deshacía lo que imponía.

---

## Contexto

`ecuDiscovery.ts` emitía `AT SP 6` antes del broadcast, fijando el bus a CAN de 11 bits
a 500 kbps. La secuencia de restauración devolvía `AT H0` y `AT SH 7E0`, pero **no el
protocolo**.

En un vehículo que no fuera protocolo 6 eso tenía tres consecuencias:

1. El barrido fallaba — inevitable, porque el parser de cabeceras y el catálogo de
   direcciones son CAN por diseño.
2. **Y además tumbaba el resto de la sesión**, que es lo que no era inevitable: el
   adaptador quedaba fijado a un protocolo que el coche no habla, así que a partir de ahí
   fallaban también la telemetría, los DTC y el VIN. Esas lecturas sí funcionaban antes
   del barrido, porque el `ATSP0` del init las había negociado bien.
3. No se recuperaba solo. El init se reejecuta al reconectar
   (`reliableTransport.ts`), pero ahí la conexión con el dongle sigue viva: lo que está
   muerto es el enlace con el coche. Hacía falta reiniciar el proceso.

La detección de protocolo ya existía, pero **fuera de la aplicación**:
`scripts/probe-serial.ts` pregunta `ATDPN` y lo imprime. Es una sonda manual con su propia
conexión. El código que habla con el coche nunca preguntaba.

## Decisión

**1. Preguntar, no imponer.** El barrido emite `AT DPN` como primer comando —una consulta,
no una configuración— y deriva de la respuesta la dirección de broadcast. `AT SP` desaparece
del código: el protocolo lo negocia el `ATSP0` del init y aquí solo se lee cuál salió.

**2. Cubrir los cuatro buses CAN.** Protocolos 6, 7, 8 y 9 de ISO 15765-4 —11 y 29 bits, a
500 y 250 kbps—, que es todo vehículo con OBD-II de 2008 en adelante.

**3. Abstenerse fuera de CAN, sin tocar el adaptador.** En los protocolos 1–5 (J1850,
ISO 9141-2, KWP2000) y en el A (J1939), el barrido devuelve `[]` **sin emitir un solo
comando de configuración**. El broadcast por functional addressing no tiene equivalente
fuera de CAN, y tocar el adaptador para nada es exactamente lo que rompía la sesión.

**4. Restaurar al estado previo real.** El restore deja la dirección funcional del bus
negociado (`7DF` o `18DB33F1`), no `7E0`. El init nunca emite `AT SH`, así que antes del
primer barrido el adaptador está en su valor por defecto, que es el broadcast: dejarlo
apuntando físicamente al ECM hacía que las lecturas se comportaran distinto antes y después
de un barrido.

**5. Declarar el bus real.** `EcuInfo.protocol` sale del protocolo negociado en vez de la
constante `'CAN_11_500'`, que era falsa en cualquier otro bus.

## Consecuencias

**A favor**

- Un vehículo pre-CAN deja de perder la sesión por usar una pantalla que no le aplica.
- El barrido funciona en 29 bits, que es el segundo bus más común.
- Lo que se persiste sobre cada ECU deja de ser una suposición.
- El bitrate deja de estar decidido en nuestro código: no era nuestra decisión.

**En contra, o pendiente**

- El barrido sigue sin cubrir los pre-CAN. Es una limitación consciente, no un olvido:
  el descubrimiento ahí es otro mecanismo y mezclarlo en `discoverEcus` haría de una
  función corta dos algoritmos con un `if` en medio. Si hace falta, es otro change.
- **El direccionamiento de 29 bits está respaldado por ISO 15765-4 y por tests, no por
  una prueba contra un coche real**: no había ninguno de 29 bits disponible. El filtro de
  validez tampoco puede copiarse del de 11 bits — allí la norma reserva una ventana
  estrecha (`7E8`–`7EF`) y basta el rango; en 29 bits la dirección de la ECU es un byte
  sin ventana equivalente, así que el criterio es estructural: la trama va dirigida al
  equipo de diagnóstico (`18DAF1xx`).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Añadir solo `AT SP 0` al restore | Una línea, evita que el adaptador se quede clavado. Pero deja el problema de fondo: el barrido sigue rompiendo la sesión antes de recuperarla, y sigue sin saber con qué bus habla |
| Soportar también los pre-CAN | El descubrimiento fuera de CAN es otro mecanismo (direccionamiento de tres bytes, inicialización propia). No cabe en la misma función |
| Derivar el protocolo del VIN o del año | Sería inventar un dato que el adaptador ya conoce. Basta preguntárselo |

## Referencias

- ISO 15765-4 — direccionamiento de diagnóstico sobre CAN, 11 y 29 bits.
- Hoja de datos del ELM327 — comandos `AT SP`, `AT DP`, `AT DPN` y la numeración de protocolos.
- `openspec/changes/2026-08-19-negotiate-can-protocol-before-ecu-scan/` — diseño completo.
