# ADR 004: ELM327-emulator como referencia de protocolo OBD-II

**Estado:** Aprobado  
**Fecha:** 2026-07-11

---

## Contexto

El proyecto necesita un simulador de tráfico OBD-II que hable el protocolo ELM327 real (capas AT, CAN 11-bit, ISO-TP) para:

1. **Desarrollo**: generar tráfico OBD realista contra el que validar nuestro parser `hexParser.ts`
2. **Testing**: verificar que nuestra futura implementación TypeScript del protocolo ELM327 produce respuestas idénticas
3. **Demo**: mostrar el flujo completo desde una herramienta externa hasta nuestro backend

Implementar el stack ELM327 completo desde cero en TypeScript sin una referencia funcional es ineficiente y propenso a errores de protocolo.

## Decisión

**Usar ELM327-emulator (Python, v3.0.5) como sidecar Docker para desarrollo y testing.**

- Se despliega como servicio `elm327` en Docker Compose, escuchando TCP en `:35000`
- Escenario por defecto: `car` (Toyota Auris Hybrid, ~25 PIDs SAE J1979)
- Nuestro backend se conecta vía TCP, envía comandos AT/OBD reales y parsea respuestas
- **No se distribuye** en producción: licencia CC-BY-NC-SA-4.0 incompatible con uso comercial
- El emulador sirve como **referencia de protocolo** para construir nuestra propia implementación TypeScript (`infrastructure/elm327-simulator/`)

## Consecuencias

### Positivas

- Protocolo ELM327 real (AT commands, CAN 11-bit, ISO-TP flow control) desde el primer día
- Validable contra herramientas externas (Torque, python-OBD, cualquier app OBD-II)
- El escenario `car` incluye un diccionario realista de PIDs (Toyota Auris Hybrid)
- Ahorra semanas de implementación ciega del protocolo
- El catálogo de PIDs (`data/pids/service-01.json`) se desarrolla en paralelo sin dependencia del emulador

### Negativas

- Dependencia de Python 3.11 en entorno de desarrollo (no afecta a producción)
- El emulador requiere stdin abierto (`tail -f /dev/null`) para no terminar en Docker
- La licencia CC-BY-NC-SA impide incluir el emulador en un producto comercial
- El escenario `car` solo expone ~25 PIDs de los ~80 del estándar — no cubre todos los casos de prueba

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
