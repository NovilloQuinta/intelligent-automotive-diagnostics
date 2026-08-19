# Guion de grabacion de la demo

> Para el video del TFM. Modo docker (tres vehiculos emulados) y, si da tiempo, el coche
> real por cable. Todo lo que hay aqui esta verificado contra la app corriendo el 19/08.

## 1. Antes de encender la camara

### Configuracion

```bash
cp .env.example .env
```

Y **antes de arrancar**, dos cambios obligatorios en `.env`:

| Variable                                       | Valor                  | Por que                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY`                                  | tu clave               | Con `LLM_PROVIDER=openai` y la clave vacia, **la API no arranca**: `Missing required configuration: LLM_API_KEY`. Y sin LLM no hay diagnostico cognitivo, que es el corazon del proyecto |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | cualquier cadena larga | Vienen a `changeme`                                                                                                                                                                      |

Opcional pero recomendable: `WEB_SEARCH_API_KEY`, para que el agente pueda buscar
documentacion de PIDs y ECUs propietarios en directo. Sin ella el agente funciona, pero se
queda con lo que ya sabe el catalogo.

### Arranque

```bash
docker compose up -d elm327-audi elm327-kawasaki elm327-toyota
pnpm start
```

### Comprobaciones antes de grabar

```bash
# Los tres emuladores escuchando
for p in 35000 35001 35002; do nc -z localhost $p && echo "$p OK"; done

# La API responde y el barrido encuentra las cinco ECU
curl -s localhost:4000/api-docs.json -o /dev/null -w "api-docs %{http_code}\n"
```

Entra a la UI, haz **una pasada completa en seco** y luego reinicia la API. Sirve para dos
cosas: confirmar que todo responde, y dejar la base de datos ya sembrada con el vehiculo
identificado, para que en la toma buena no haya esperas raras.

---

## 2. El guion, pantalla a pantalla

### 0. Portada (10 s)

La landing en `localhost:5173`. Solo para abrir. No te entretengas.

### 1. Identificacion del vehiculo — **Audi A3 2.0 TDI**

Elige el Audi. Espera a que lea el VIN.

> "El sistema no sabe que coche es. Lo pregunta: Modo 09 PID 02, que es el bastidor. De
> ahi saca `WAUZZZ8V5JA123456`, decodifica el WMI y resuelve Audi, fabricado en Alemania.
> Nada de esto esta cableado en el codigo."

Es el mejor arranque posible porque desmonta de entrada la sospecha de "esto son datos
inventados". Sale en pantalla: VIN, marca, modelo, ano, motor, fabricante (WMI), origen.

Pulsa **Entrar a diagnostico**.

### 2. Datos Vivo

> "Telemetria en tiempo real: 770 rpm, 90 grados de refrigerante, parado, 35 de admision.
> Y abajo, los 16 PIDs que **este** vehiculo declara soportar — no una lista fija, se lee
> del bitmask del PID 00."

Pulsa **INICIAR DIAGNOSTICO** y deja que corra.

### 3. Codigos DTC

Las tres averias del escenario, con las tres pestanas (Almacenadas / Pendientes /
Permanentes).

> "Modo 03. Tres averias confirmadas: fallo de encendido en el cilindro 1, EGR insuficiente
> y filtro de particulas por debajo de umbral. Las tres pestanas son los servicios 03, 07 y
> 0A del estandar."

**No pulses "Borrar averias"** en camara: es la unica escritura del sistema y te deja el
escenario vacio para el resto de la grabacion.

### 4. Freeze Frame

> "El Modo 02 congela los valores en el instante del fallo. Es lo que permite distinguir un
> fallo en frio de uno en caliente."

### 5. Unidades de Control y Topologia ← **lo nuevo**

> "Al conectarse, la herramienta hace un barrido del bus: se dirige a la direccion de
> broadcast 7DF y escucha quien contesta. Aparecen cinco centralitas."

Y aqui **adelantate a la pregunta del tribunal**:

> "Cuatro salen como 'ECU 7E9', tipo desconocido, y es deliberado: la norma ISO 15765-4
> solo estandariza la 7E8, el motor. El resto las asigna cada fabricante. El sistema no
> inventa nombres — y ese hueco es justo lo que llena la siguiente pantalla."

### 6. Diagnostico cognitivo ← **el nucleo del TFM**

Lanza una consulta concreta, no generica. Por ejemplo:

> `El coche tironea al acelerar en frio, que puede ser?`

Mientras razona, ensena la traza de tools.

> "El modelo decide por su cuenta que preguntar y en que orden. Esto de aqui es la traza
> completa: cada herramienta que ha llamado y que le ha respondido. Es lo que hace el
> diagnostico auditable en vez de una caja negra — se puede reconstruir por que dijo lo que
> dijo."

Si el agente descubre una ECU o un PID desconocido y lo indexa, **parate ahi**: es la tesis
del proyecto en una sola pantalla. El catalogo se expande solo.

### 7. Informe

La sesion completa: veredicto, severidad, los tres DTC, las cinco ECU, el freeze frame.

### 8. Historial

Que el informe queda guardado y se puede recuperar. Un diagnostico de hace una semana sigue
ahi con sus datos congelados.

### 9. `/api-docs` (opcional, 20 s)

`localhost:4000/api-docs`.

> "La documentacion de la API no se escribe a mano: se genera desde los mismos objetos de
> validacion que se usan en ejecucion, y un test recorre las rutas reales de Express y falla
> si alguna no esta documentada. No puede quedarse desfasada."

---

## 3. Lo que conviene esquivar en camara

| Que                                               | Por que                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parar y arrancar contenedores en mitad de la toma | Si algo se cae mas de 30 s, el transporte agota la ventana de reconexion y **no vuelve solo**: la API devuelve 500 hasta reiniciarla                     |
| El boton **Borrar averias**                       | Te deja el escenario sin DTC para el resto del video                                                                                                     |
| El panel de admin con la base recien creada       | Los indices vectoriales salen vacios si el agente no ha corrido antes                                                                                    |
| Toyota y Kawasaki para el grueso de la demo       | El escenario del Audi es el unico con las tres averias y los PIDs de fabricante. Usalos solo para ensenar que hay varios vehiculos y que uno es una moto |

---

## 4. El coche real

**Antes de enchufar nada**, en el `.env`:

```
OBD_MODE=serial
SERIAL_PORT_PATH=/dev/ttyUSB0     # confirmalo con `pnpm obd:probe`
OBD_READ_ONLY=true
```

`OBD_READ_ONLY=true` es ya **redundante pero recomendable dejarlo escrito**: desde la
revision del 19/08 el solo lectura se fuerza solo con `OBD_MODE=serial` o `tcp`, asi que el
borrado de DTC queda bloqueado aunque se olvide. Ponerlo explicito documenta la intencion.

Orden de la sesion:

1. `pnpm obd:probe` en la mesa, con el adaptador conectado pero sin coche. Con el coche
   ya enchufado, la sonda imprime ademas el protocolo (`ATDPN` + `ATDP`) y si el barrido
   de ECUs esta disponible en ese bus.
2. Pegar el bloque que imprime en el `.env`.
3. Contacto puesto, motor en marcha o no segun lo que quieras ensenar.
4. `pnpm start` y conectar.
5. Nadie con las manos en el vano motor.

Que esperar del barrido de ECUs en un coche real: encontrara las centralitas de emisiones
que contesten en el rango `7E8`–`7EF` — tipicamente el motor, y el cambio si es automatico.
**No** los treinta sistemas que lista una maquina de taller: esos viven fuera del rango
legislado y se leen por protocolos de fabricante, que este proyecto no implementa. Si te lo
preguntan, esa es la respuesta, y esta documentada en
`docs/infrastructure/elm327-emulator.md`.

El barrido ya no impone el protocolo: pregunta con `AT DPN` cual negocio el adaptador y
deriva de ahi la direccion de broadcast. Cubre los cuatro buses CAN (6, 7, 8 y 9). Si el
coche habla un protocolo anterior a CAN, no barre y devuelve lista vacia **sin tocar el
adaptador**, asi que la telemetria, los DTC y el VIN siguen funcionando. Un A3 de 2018 es
protocolo 6, el caso comun. Detalle en `docs/adr/009-negociacion-de-protocolo-obd.md`.

---

## 5. Si algo se cae en mitad de la toma

```bash
# Comprobar quien esta vivo
for p in 4000 5173 35000 35001 35002; do nc -z localhost $p && echo "$p OK" || echo "$p CAIDO"; done
```

Si la API devuelve 500 con `Reconnection failed after 30s`, no esperes: **reinicia la API**.
No se recupera sola aunque el emulador vuelva. Es deuda conocida, esta en
`docs/deuda-conocida.md`.
