## Contexto técnico

Lo verificado sobre `develop` (`a9ada00`), no supuesto:

| Pieza | Estado |
|---|---|
| `ecuDiscovery.ts` | Barrido por functional addressing ya implementado: `AT E0/L0/H1/SP 6/SH 7DF` + `01 00`, fallback a addressing físico al ECM, y restauración de estado en `finally` |
| `parseCanHeaders` (`protocol.ts:267`) | Recoge múltiples respondedores, deduplicados y en orden de aparición |
| `isObdResponseAddr` (`protocol.ts:250`) | Filtra al rango ISO 15765-4 `7E8–7EF`. Descarta 29-bit y direcciones fuera de rango |
| `ecuAddressCatalog.ts:40` | Solo `7E8` = Engine Control Module. El resto → `ECU <addr>`, tipo `unknown` |
| `TopologyMapPanel.tsx` | Recibe `{ ecus, loading, error, selectedId }`. **No conoce los DTC** |
| `fetchDtcCodes` (`elm327Adapter.ts:212`) | Emite el modo con headers OFF; `parseDtcResponse` devuelve pares de bytes sin origen |
| Escenario Audi | 38 usos de `ECU_R_ADDR_E`, 0 de cualquier otra dirección |

## D1 — Multi-ECU en el emulador: respuestas multi-header

ELM327-emulator resuelve **una** entrada por petición (`elm.py:2103` hace `return` en la
primera coincidencia), así que no se puede declarar una entrada por ECU para el mismo
comando. Pero un `Response` es una cadena de bloques y admite varios headers seguidos:

```python
'Response': HD(ECU_R_ADDR_E) + SZ('06') + DT('41 00 BE 3F A8 13') +
            HD(ECU_R_ADDR_T) + SZ('06') + DT('41 00 80 00 00 01') + ...
```

Es el patrón que usa su propio escenario `car` (`obd_message.py:654`, `:783`). Se aplica
**solo a `01 00`**, que es lo que el scan usa para descubrir: el resto de PIDs siguen
contestando desde el motor y ninguna respuesta existente cambia.

**Direcciones elegidas**, las cinco del rango legislado que `protocol.ts` acepta:

| Constante | Resp. | ECU |
|---|---|---|
| `ECU_R_ADDR_E` | 7E8 | Motor (ya existe) |
| `ECU_R_ADDR_T` | 7E9 | Transmisión |
| `ECU_R_ADDR_U` | 7EA | Control híbrido |
| `ECU_R_ADDR_B` | 7EB | Batería de tracción |
| `ECU_R_ADDR_M` | 7ED | Powertrain |

Quedan fuera ABS (7B0/7B8) y A/C (7C4/7CC): el filtro las descarta con razón, y ampliar
el rango legislado es otra discusión.

## D2 — Las ECUs desconocidas se quedan desconocidas

Cuatro de las cinco saldrán como `ECU 7E9` con tipo `unknown`, porque el catálogo solo
estandariza `7E8`. **Es el objetivo, no un defecto**: es lo que da trabajo al bucle de
aprendizaje de D3 y lo que demuestra la tesis del proyecto. Sembrar los nombres dejaría
un mapa bonito y una demo vacía.

## D3 — Bloque de aprendizaje de ECUs en el prompt

El prompt ya tiene la forma exacta para PIDs (`cuando read_pid o get_available_pids
devuelvan un PID cuyo significado no reconozcas…`) y para DTCs. Se añade el tercero,
simétrico: cuando `get_ecu_info` devuelva una ECU cuyo nombre no reconozca, buscar en el
catálogo (`search_similar_ecus`), resolver si hace falta, e indexar (`index_ecu`).

**Riesgo y mitigación**: es la única parte que cambia el comportamiento del modelo. Se
valida con `pnpm eval:agent`, que **necesita la clave del usuario**, y hay que correr
**el grupo A entero** además de B–E: un bloque de instrucciones nuevo puede volver al
agente más verboso o más reticente en consultas legítimas.

## D4 — Atribuir cada DTC a su ECU

El cambio con más superficie, de dominio a UI:

1. **Lectura**: `fetchDtcCodes` emite el modo con `AT H1` puesto y restaura `AT H0` en
   `finally`, igual que hace `discoverEcus`. Es el mismo patrón, no uno nuevo.
2. **Parseo**: una variante de `parseDtcResponse` que agrupa por header en vez de
   aplanar. Reutiliza `parseCanHeaders` para reconocer las direcciones válidas.
3. **Dominio**: `DtcCode` gana un `ecuAddress?: string`. **Opcional a propósito**: con
   headers apagados —o en un coche que no los devuelva— sigue siendo un DTC válido sin
   origen. Hacerlo obligatorio rompería el flujo determinista y el emulador de otros
   escenarios.
4. **UI**: `TopologyMapPanel` recibe los DTC además de las ECUs y marca el nodo cuyo
   `responseAddr` coincide. Los DTC sin origen no marcan ninguno.

**Alternativa descartada**: derivar la ECU del prefijo del código (P=powertrain,
B=body…). Es la *categoría* del código en SAE J2012, no la ECU que lo reporta — un P0301
puede venir del motor o del powertrain. Sería inventar el dato en vez de leerlo.

## Orden y riesgo

D1 es aditivo y sin TypeScript: entra primero y se puede ver el mapa con cinco nodos sin
tocar nada más. D4 es independiente de D3. D3 va al final porque es el único que no se
puede validar en este entorno.
