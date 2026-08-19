/**
 * Sonda de hardware ELM327 por USB/serie: descubre puerto, baud rate y estado
 * del enlace con el vehiculo ANTES de arrancar la aplicacion.
 *
 * No reutiliza el transporte de la app a proposito. Si esta sonda funciona y la
 * app no, el fallo esta en la app; si la sonda falla, el fallo es el cable, el
 * driver o los permisos del puerto.
 *
 * Uso: pnpm obd:probe [--port /dev/ttyUSB0] [--baud 38400] [--all]
 * Sin argumentos escanea los puertos con pinta de adaptador y prueba los bauds
 * habituales. `--all` incluye tambien los puertos internos del sistema.
 */
import { SerialPort } from 'serialport'
import { selectAdapterCandidates } from './probeCandidates.js'

/** Bauds de fabrica mas comunes en ELM327 originales y clones CH340/STN. */
const BAUD_CANDIDATES = [38400, 9600, 115200, 57600, 500000]

/** Timeout de un comando AT normal, que responde de inmediato. */
const AT_TIMEOUT_MS = 3000

/** `ATZ` reinicia el chip: tarda entre 1 y 2 segundos en devolver el banner. */
const RESET_TIMEOUT_MS = 5000

/** El primer comando OBD dispara la busqueda de protocolo (`SEARCHING...`). */
const BUS_TIMEOUT_MS = 12_000

/** Por debajo de esta tension el vehiculo esta sin contacto o la bateria esta baja. */
const MIN_HEALTHY_VOLTS = 11.5

/** Proporcion minima de caracteres imprimibles para dar un baud por bueno. */
const PRINTABLE_RATIO = 0.9

interface ProbeArgs {
  readonly port: string | undefined
  readonly baud: number | undefined
  /** Prueba tambien los puertos internos del sistema, descartados por defecto. */
  readonly all: boolean
}

interface ProbeHit {
  readonly path: string
  readonly baud: number
  readonly banner: string
}

function parseArgs(argv: string[]): ProbeArgs {
  const portIdx = argv.indexOf('--port')
  const baudIdx = argv.indexOf('--baud')
  const rawBaud = baudIdx === -1 ? undefined : Number(argv[baudIdx + 1])
  return {
    port: portIdx === -1 ? undefined : argv[portIdx + 1],
    baud: rawBaud !== undefined && Number.isFinite(rawBaud) ? rawBaud : undefined,
    all: argv.includes('--all'),
  }
}

function openPort(path: string, baudRate: number): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate }, (err) => {
      if (err) reject(err)
      else resolve(port)
    })
  })
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    if (!port.isOpen) {
      resolve()
      return
    }
    port.close(() => resolve())
  })
}

/** Envia un comando y acumula la respuesta hasta el prompt `>` o hasta el timeout. */
function converse(port: SerialPort, cmd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    const onData = (chunk: Buffer): void => {
      data += chunk.toString()
      if (data.includes('>')) finish()
    }
    const finish = (): void => {
      clearTimeout(timer)
      port.off('data', onData)
      resolve(data)
    }
    const timer = setTimeout(finish, timeoutMs)
    port.on('data', onData)
    port.write(`${cmd}\r`)
  })
}

/**
 * Un baud equivocado no produce silencio: produce basura binaria. Se acepta la
 * respuesta solo si llego el prompt y el texto es mayoritariamente ASCII legible.
 */
function isPlausibleReply(raw: string): boolean {
  if (!raw.includes('>')) return false
  const printable = [...raw].filter(
    (c) => c === '\r' || c === '\n' || (c >= ' ' && c <= '~'),
  ).length
  return printable >= raw.length * PRINTABLE_RATIO
}

/** Deja la respuesta cruda en lineas legibles, sin prompt ni vacios. */
function clean(raw: string): string {
  return raw
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== '>')
    .join(' | ')
}

function explainOpenError(path: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`  [FALLO] no se pudo abrir ${path}: ${message}`)
  if (/access denied|permission/i.test(message)) {
    console.error(`  -> Sin permisos sobre el puerto. Anade tu usuario al grupo dialout:`)
    console.error(`     sudo usermod -aG dialout $USER   (y vuelve a iniciar sesion)`)
  }
  if (/no such file|cannot open/i.test(message)) {
    console.error(`  -> El puerto no existe. Revisa 'dmesg | tail' al enchufar el cable.`)
  }
  if (/busy|resource temporarily unavailable/i.test(message)) {
    console.error(`  -> Puerto ocupado. Cierra la app (pnpm start) u otro programa OBD.`)
  }
}

/** Prueba una lista de bauds sobre un puerto y devuelve el primero que contesta. */
async function probePort(path: string, bauds: number[]): Promise<ProbeHit | null> {
  for (const baud of bauds) {
    let port: SerialPort | null = null
    try {
      port = await openPort(path, baud)
      const raw = await converse(port, 'ATZ', RESET_TIMEOUT_MS)
      if (isPlausibleReply(raw)) {
        console.log(`  [OK]    ${path} @ ${baud} -> ${clean(raw)}`)
        return { path, baud, banner: clean(raw) }
      }
      console.log(`  [----]  ${path} @ ${baud} sin respuesta legible`)
    } catch (err) {
      explainOpenError(path, err)
      return null
    } finally {
      if (port !== null) await closePort(port)
    }
  }
  return null
}

/** Interpreta la respuesta a `0100`, que es la que dice si hay coche de verdad detras. */
function reportBusState(pidsRaw: string, protocolRaw: string, protocolNameRaw: string): void {
  const pids = clean(pidsRaw)
  if (/41\s*00/i.test(pids)) {
    console.log(`  ECU responde         : SI (${pids})`)
    // El numero es lo que consume la aplicacion (`resolveCanBus`); el nombre es
    // para confirmar de un vistazo, con el coche delante, que los dos coinciden.
    console.log(`  Protocolo detectado  : ${clean(protocolRaw)}  (ATDPN)`)
    console.log(`  Protocolo (nombre)   : ${clean(protocolNameRaw)}  (ATDP)`)
    reportEcuScanSupport(clean(protocolRaw))
    return
  }
  console.log(`  ECU responde         : NO (${pids})`)
  if (/UNABLE TO CONNECT/i.test(pids)) {
    console.log(`  -> El adaptador vive pero no engancha el bus: pon el contacto (llave en ON).`)
  } else if (/NO DATA|SEARCHING/i.test(pids)) {
    console.log(`  -> Sin respuesta de la ECU. Con el motor arrancado suele resolverse.`)
  } else {
    console.log(`  -> Respuesta inesperada. Guarda esta salida: es util para depurar el parser.`)
  }
}

/** Numeros de protocolo ELM327 que corresponden a un bus CAN (ISO 15765-4). */
const CAN_PROTOCOL_NUMBERS = ['6', '7', '8', '9']

/**
 * Avisa de si el barrido de ECUs va a funcionar en este vehiculo.
 *
 * Las lecturas —PID, DTC, VIN— funcionan en los diez protocolos. El barrido por
 * broadcast funcional solo existe en CAN, asi que fuera de el la aplicacion se
 * abstiene en vez de tocar el adaptador. Mejor saberlo aqui que delante del coche.
 */
function reportEcuScanSupport(protocolNumber: string): void {
  const number = protocolNumber.replace(/^A/i, '')
  if (CAN_PROTOCOL_NUMBERS.includes(number)) {
    console.log(`  Barrido de ECUs      : disponible (bus CAN)`)
    return
  }
  console.log(`  Barrido de ECUs      : no disponible en este bus (solo CAN)`)
  console.log(`  -> Las lecturas de PID, DTC y VIN si funcionan con normalidad.`)
}

/** Secuencia de identificacion sobre el puerto ya validado. */
async function identify(hit: ProbeHit): Promise<void> {
  const port = await openPort(hit.path, hit.baud)
  try {
    await converse(port, 'ATZ', RESET_TIMEOUT_MS)
    await converse(port, 'ATE0', AT_TIMEOUT_MS)
    const version = await converse(port, 'ATI', AT_TIMEOUT_MS)
    const voltage = await converse(port, 'ATRV', AT_TIMEOUT_MS)
    await converse(port, 'ATSP0', AT_TIMEOUT_MS)
    const pids = await converse(port, '0100', BUS_TIMEOUT_MS)
    const protocol = await converse(port, 'ATDPN', AT_TIMEOUT_MS)
    const protocolName = await converse(port, 'ATDP', AT_TIMEOUT_MS)

    console.log(`\n--- Identificacion ---`)
    console.log(`  Firmware             : ${clean(version)}`)
    console.log(`  Tension de bateria   : ${clean(voltage)}`)
    warnOnLowVoltage(voltage)
    reportBusState(pids, protocol, protocolName)
  } finally {
    await closePort(port)
  }
}

function warnOnLowVoltage(voltageRaw: string): void {
  const match = clean(voltageRaw).match(/(\d+(?:\.\d+)?)\s*V/i)
  if (match === null) return
  const volts = Number(match[1])
  if (volts < MIN_HEALTHY_VOLTS) {
    console.log(`  -> Tension baja (${volts}V): el coche esta sin contacto o la bateria flojea.`)
  }
}

function printEnvBlock(hit: ProbeHit): void {
  console.log(`\n--- Pega esto en tu .env ---`)
  console.log(`OBD_MODE=serial`)
  console.log(`SERIAL_PORT_PATH=${hit.path}`)
  console.log(`SERIAL_BAUD_RATE=${hit.baud}`)
}

/** Lista los puertos del sistema; devuelve los paths en orden de descubrimiento. */
async function listPorts(includeAll: boolean): Promise<string[]> {
  let ports: Awaited<ReturnType<typeof SerialPort.list>>
  try {
    ports = await SerialPort.list()
  } catch (err) {
    // En Linux la enumeracion delega en udevadm, que no existe en entornos minimos.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`No se pudieron enumerar los puertos: ${message}`)
    console.error('Indica el puerto a mano: pnpm obd:probe --port /dev/ttyUSB0')
    return []
  }
  if (ports.length === 0) {
    console.log('No hay puertos serie. Enchufa el adaptador y revisa "dmesg | tail".')
    return []
  }
  const all = ports.map((p) => p.path)
  const candidates = includeAll ? all : selectAdapterCandidates(all)
  const shown = candidates.length > 0 ? candidates : all

  console.log(`Puertos serie detectados (${all.length}):`)
  for (const p of ports) {
    if (!shown.includes(p.path)) continue
    const vendor = p.manufacturer ?? p.vendorId ?? 'desconocido'
    console.log(`  ${p.path.padEnd(24)} ${vendor}`)
  }

  if (candidates.length === 0) {
    reportNoCandidates(all.length)
    return []
  }
  if (candidates.length < all.length) {
    console.log(`Descartados ${all.length - candidates.length} puertos internos del sistema.`)
  }
  return candidates
}

/**
 * Ningun puerto tiene pinta de adaptador. Casi siempre no es un problema de la
 * sonda sino de que el dongle no ha llegado al sistema donde corre este proceso.
 */
function reportNoCandidates(total: number): void {
  console.error(`\nNinguno de los ${total} puertos es un adaptador USB o Bluetooth.`)
  console.error('Los /dev/ttyS* de Linux son puertos internos: existen siempre, haya o no cable.\n')
  console.error('Por orden de probabilidad:')
  if (process.platform === 'linux') {
    console.error('  1. El proceso corre en un contenedor o VM sin el USB pasado por dentro.')
    console.error('     El dongle esta en el anfitrion, no aqui. Corre la sonda fuera del')
    console.error('     contenedor, o pasa el dispositivo con --device=/dev/ttyUSB0.')
    console.error('  2. El driver no ha creado el nodo. Enchufa el cable y mira:')
    console.error('     dmesg | tail    (deberia aparecer ch341/cp210x/ftdi_sio y ttyUSB0)')
    console.error('     lsusb           (deberia listar el conversor USB-serie)')
  } else if (process.platform === 'darwin') {
    console.error('  1. Falta el driver del conversor (CH340/CP210x no vienen de serie).')
    console.error('  2. Mira si el sistema lo ve:  ls /dev/cu.*')
  }
  console.error('\nSi sabes cual es, saltate la deteccion: pnpm obd:probe --port <ruta>')
  console.error('Para probarlos todos de todas formas: pnpm obd:probe --all')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const bauds = args.baud !== undefined ? [args.baud] : BAUD_CANDIDATES
  const paths = args.port !== undefined ? [args.port] : await listPorts(args.all)
  if (paths.length === 0) process.exit(1)

  console.log(`\nProbando ${paths.length} puerto(s) con bauds [${bauds.join(', ')}]...`)
  let hit: ProbeHit | null = null
  for (const path of paths) {
    hit = await probePort(path, bauds)
    if (hit !== null) break
  }

  if (hit === null) {
    console.error('\nNingun puerto respondio a ATZ. Revisa cable, driver y permisos.')
    process.exit(1)
  }

  await identify(hit)
  printEnvBlock(hit)
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('Sonda interrumpida:', err instanceof Error ? err.message : err)
  process.exit(1)
})
