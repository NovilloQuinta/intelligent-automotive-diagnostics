# ADR 004: ELM327-emulator como referencia de protocolo OBD-II

**Estado:** Aprobado (revisado Fase 4)  
**Fecha:** 2026-07-11 | **Revisado:** 2026-08-18

---

## Contexto

El proyecto necesita un simulador de tráfico OBD-II que hable el protocolo ELM327 real (capas AT, CAN 11-bit, ISO-TP) para:

1. **Desarrollo**: generar tráfico OBD realista contra el que validar nuestro parser `hexParser.ts`
2. **Testing**: verificar que nuestra futura implementación TypeScript del protocolo ELM327 produce respuestas idénticas
3. **Demo**: mostrar el flujo completo desde una herramienta externa hasta nuestro backend

Implementar el stack ELM327 completo desde cero en TypeScript sin una referencia funcional es ineficiente y propenso a errores de protocolo.

## Decisión

**Usar ELM327-emulator (Python) como sidecar Docker para desarrollo, testing y demo.**

- Se despliega en Docker Compose como **tres servicios**, uno por vehículo emulado, todos desde el
  mismo `docker/elm327/Dockerfile` y diferenciados por la variable `SCENARIO_SCRIPT`:

  | Servicio | Script | Puerto | Vehículo |
  |---|---|---|---|
  | `elm327-audi` | `run_audi.py` | 35000 | Audi A3 TDI (escenario propio, `scenarios/audi_a3_tdi.py`) |
  | `elm327-kawasaki` | `run_kawasaki.py` | 35001 | Kawasaki Z900 (escenario propio, `scenarios/kawasaki_z900.py`) |
  | `elm327-toyota` | `run_toyota.py` | 35002 | Toyota Auris Hybrid (escenario `car` integrado, con el VIN parcheado) |

- **Escenario por defecto de la imagen**: `SCENARIO_SCRIPT=run_audi.py`. El escenario `car`
  integrado del emulador (Toyota) ya no es el predeterminado: se conserva como tercer servicio
  porque aporta un diccionario de PIDs distinto y ajeno a nosotros, útil como contraste.
- Nuestro backend se conecta vía TCP, envía comandos AT/OBD reales y parsea respuestas
- El emulador sirve como **referencia de protocolo** para nuestra propia implementación TypeScript,
  que vive en `infrastructure/simulation/` (`simulator.ts`, `simulatorAdapter.ts`, `scenario.ts`,
  `seedScenarios.ts`) — no en `infrastructure/elm327-simulator/`, ruta que nunca llegó a existir.

### Nota de licencia (revisión 2026-08-18)

La versión original de este ADR afirmaba que el emulador **no se distribuye en producción**. Eso ha
dejado de ser cierto: el pipeline de despliegue construye y publica la imagen
`ghcr.io/novilloquinta/intelligent-automotive-diagnostics/elm327` y la ejecuta en el VPS de la demo,
porque la web pública necesita los tres vehículos emulados (el VPS no puede ver un dongle físico).

La licencia de ELM327-emulator es **CC-BY-NC-SA-4.0**: permite uso y redistribución no comercial
con atribución y bajo la misma licencia. Una demo académica de TFM sin explotación comercial encaja
en la cláusula NC, pero la condición de atribución aplica igual y la de *share-alike* afecta a la
imagen publicada. **Punto abierto**: revisar antes de cualquier uso comercial del proyecto, y
valorar marcar el paquete de GHCR como privado si no se quiere redistribuir la imagen.

## Consecuencias

### Positivas

- Protocolo ELM327 real (AT commands, CAN 11-bit, ISO-TP flow control) desde el primer día
- Validable contra herramientas externas (Torque, python-OBD, cualquier app OBD-II)
- Tres vehículos emulados en paralelo (coche gasolina/híbrido, coche diésel y moto) cubren casos de prueba distintos sin hardware
- Ahorra semanas de implementación ciega del protocolo
- El catálogo de PIDs (`data/pids/service-01.json`) se desarrolla en paralelo sin dependencia del emulador

### Negativas

- Dependencia de Python 3.11 en entorno de desarrollo (no afecta a producción)
- El emulador requiere stdin abierto (`tail -f /dev/null`) para no terminar en Docker
- Los escenarios exponen un subconjunto de los ~80 PIDs del estándar — no cubren todos los casos de prueba
- La licencia CC-BY-NC-SA obliga a atribución y *share-alike* sobre la imagen publicada en GHCR

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| Implementar ELM327 desde cero sin referencia | Ineficiente: meses de desarrollo sin garantía de corrección |
| Usar solo `obdSimulator.ts` interno con bytes crudos | No habla protocolo ELM327 real, no interoperable con herramientas externas |
| Usar `obdsim` (otro emulador C) | Menos documentado, sin multi-ECU, sin plugin system |
| Usar ELM327-emulator como dependencia Python directa | Rompe el stack Node/TypeScript uniforme; sidecar Docker es más limpio |

## Referencias

- [ELM327-emulator en PyPI](https://pypi.org/project/ELM327-emulator/)
- [ELM327-emulator en GitHub](https://github.com/Ircama/ELM327-emulator)
- [SAE J1979 — OBD-II PIDs (Wikipedia)](https://en.wikipedia.org/wiki/OBD-II_PIDs)
- [ELM327 AT Commands Reference](https://www.elmelectronics.com/wp-content/uploads/2016/07/ELM327DS.pdf)
