# Guion de grabacion de la demo

> Para el video del TFM. Modo docker (tres vehiculos emulados) y, si da tiempo, el coche
> real por cable. Escrito el 19/08, actualizado el 31/08 (ECUs reducidas a las 2 reales,
> punto 5b nuevo sobre PID/DTC + panel de conocimiento, y dos correcciones de config
> verificadas contra el codigo real).

## 1. Antes de encender la camara

### Configuracion

```bash
cp .env.example .env
```

Y **antes de arrancar**, cambios obligatorios en `.env` (verificado el 31/08 contra el
codigo real, no solo el comentario del `.env.example`):

| Variable                                       | Valor                  | Por que                                                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`     | tu clave, URL y modelo | Con `LLM_PROVIDER=openai` (el de por defecto) los **tres** son obligatorios: si falta cualquiera, `createLlmClient` lanza `Missing required configuration: ...` sin capturar y **la API entera no arranca** — no es que el diagnostico se apague, es un crash de arranque. |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | cualquier cadena larga | Vienen a `changeme`                                                                                                                                                                                              |

Opcional pero recomendable: `WEB_SEARCH_API_KEY`, para que el agente pueda buscar
documentacion de PIDs y ECUs propietarios en directo. Sin ella el agente funciona, pero se
queda con lo que ya sabe el catalogo.

Si vas a grabar el punto 5b (panel de administracion, para enseñar donde se guarda lo que
aprende el agente), rellena tambien `ADMIN_EMAIL`/`ADMIN_PASSWORD`: sin esas dos variables
no se crea ningun usuario admin al arrancar y `/admin/knowledge` no es accesible.

### Arranque

```bash
docker compose up -d elm327-audi elm327-kawasaki elm327-toyota
pnpm start
```

### Comprobaciones antes de grabar

```bash
# Los tres emuladores escuchando
for p in 35000 35001 35002; do nc -z localhost $p && echo "$p OK"; done

# La API responde y el barrido encuentra las dos ECU (motor + caja de cambios)
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

### 5. Unidades de Control y Topologia ← **actualizado el 31/08**

> "Al conectarse, la herramienta hace un barrido del bus: se dirige a la direccion de
> broadcast 7DF y escucha quien contesta. Aparecen dos centralitas."

Y aqui **adelantate a la pregunta del tribunal**:

> "La norma ISO 15765-4 solo estandariza la direccion del motor, 7E8. El resto las asigna
> cada fabricante y no hay ninguna convencion universal — el sistema no inventa nombres.
> La caja de cambios, en 7E9, si tiene nombre porque esta verificada contra trafico real de
> la plataforma de este coche, documentado en `docs/deuda-conocida.md` — es un dato
> sembrado, no adivinado. El resto de centralitas de un coche real (ABS, airbag, confort)
> no aparecen aqui: viven detras de la pasarela propietaria del fabricante, no responden a
> un lector OBD-II generico como este."

Es mas honesto que la version anterior de este guion (mostraba 5 centralitas, 3 sin
ninguna fuente real detras) y evita que el tribunal pregunte por una que no puedas
justificar.

### 5b. El catalogo que aprende: PID y DTC — el mejor sitio para "enseñar que se guarda"

Aqui es donde de verdad se ve la tesis del catalogo auto-expansivo, no en las ECU (para
este coche ya no queda ninguna por descubrir tras el punto anterior).

En el diagnostico cognitivo (punto 6), si el agente llama a `search_similar_pids` y
despues `index_pid` para un PID Mode 22 propietario que no reconociera, señalalo:

> "Esto no estaba en ningun sitio: el agente ha encontrado un PID que no reconocia, ha
> buscado si alguien ya lo habia aprendido antes, y como no existia, lo ha guardado el
> mismo — con la formula de conversion que ha inferido."

Y entonces ve al panel de administracion → Knowledge (`/admin/knowledge`, requiere un
usuario admin — rellena `ADMIN_EMAIL`/`ADMIN_PASSWORD` en el `.env` antes de arrancar, si
no, no se crea ningun admin) y busca ese mismo PID:

> "Esto es la base de datos relacional y el indice vectorial en directo. No es una captura
> de pantalla — es el mismo dato que el agente acaba de escribir, consultable ahora mismo."

Es la escena que demuestra las dos piezas a la vez: que el agente aprende, y donde queda
guardado lo que aprende.

### 6. Diagnostico cognitivo ← **el nucleo del TFM**

Lanza una consulta concreta, no generica. Por ejemplo:

> `El coche tironea al acelerar en frio, que puede ser?`

Mientras razona, ensena la traza de tools.

> "El modelo decide por su cuenta que preguntar y en que orden. Esto de aqui es la traza
> completa: cada herramienta que ha llamado y que le ha respondido. Es lo que hace el
> diagnostico auditable en vez de una caja negra — se puede reconstruir por que dijo lo que
> dijo."

Si el agente descubre un PID o un DTC desconocido y lo indexa, **parate ahi**: es la tesis
del proyecto en una sola pantalla, y es el momento de ir al punto 5b. El catalogo se
expande solo. (Para ECU no queda nada por descubrir en este coche: solo hay dos y las dos
ya tienen nombre — ver el punto 5.)

### 7. Informe

La sesion completa: veredicto, severidad, los tres DTC, las dos ECU, el freeze frame.

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
| Parar y arrancar contenedores en mitad de la toma | El transporte se recupera solo desde el 27/08, pero mientras dura la caida (hasta 30 s) el diagnostico en curso puede fallar con 500 — mejor no arriesgar el plano                     |
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

Si la API devuelve 500 con `Reconnection failed after 30s`: **resuelto el 27/08**, el
transporte ya se recupera solo en cuanto el emulador o el coche vuelven a responder — no
hace falta reiniciar la API. Si aun asi no responde tras medio minuto, entonces si conviene
mirar los logs antes de reiniciar.
