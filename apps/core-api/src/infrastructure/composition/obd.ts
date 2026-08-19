import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import { createElm327TcpClient } from '@/infrastructure/elm327/tcpTransport.js'
import { createElm327SerialClient } from '@/infrastructure/elm327/serialTransport.js'
import {
  ELM327_INIT_COMMANDS,
  ELM327_INIT_TIMEOUT_MS,
} from '@/infrastructure/elm327/initSequence.js'
import { createConsoleTracer } from '@/infrastructure/elm327/traceConsole.js'
import {
  DiagnosisService,
  SERIAL_DIRECT_SCENARIO,
} from '@/infrastructure/services/diagnosisService.js'
import type { ScenarioDescriptor } from '@/infrastructure/services/diagnosisTypes.js'

/**
 * Cableado de la capa OBD: los tres vehiculos emulados y el servicio de diagnostico
 * segun el modo de conexion configurado.
 */

/**
 * Escenario Toyota (escenario `car` integrado del emulador).
 *
 * La telemetria (PIDs 05, 0C, 0D, 0F) y los codigos de averia se leen en
 * tiempo real del emulador via `GET /api/live-data` y `GET /api/dtc-codes`.
 * No se hardcodean valores que el emulador ya provee.
 */
function toyotaScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'toyota',
    name: 'Toyota (Built-in)',
    vehicleType: 'car',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Toyota',
      model: 'Auris Hybrid',
      year: 2016,
      engineType: '1.8L Hybrid',
      vin: new Vin('JTDKN3DU60A123456'),
    }),
    host: config.ELM327_TOYOTA_HOST,
    port: config.ELM327_TOYOTA_PORT,
  }
}

/** Escenario Audi A3 2.0 TDI, con las tres averias del diesel. */
function audiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'audi-a3-tdi',
    name: 'Audi A3 2.0 TDI',
    vehicleType: 'car',
    connectionType: 'wifi',
    vehicleInfo: new VehicleInfo({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TDI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    host: config.ELM327_AUDI_HOST,
    port: config.ELM327_AUDI_PORT,
  }
}

/** Escenario Kawasaki Z900: el unico vehiculo de dos ruedas del catalogo. */
function kawasakiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'kawasaki-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    }),
    host: config.ELM327_KAWASAKI_HOST,
    port: config.ELM327_KAWASAKI_PORT,
  }
}

/** Los tres vehiculos emulados que sirve el modo docker. */
function createDockerScenarios(config: AppConfig): ScenarioDescriptor[] {
  return [toyotaScenario(config), audiScenario(config), kawasakiScenario(config)]
}

/** Mapa scenarioId → ObdRepository creado a partir de los descriptores de escenarios. */
function createObdRepoMap(
  scenarios: ScenarioDescriptor[],
  vehicleRepo: VehicleRepository,
  logger: LoggerPort,
  trace = false,
  readOnly = false,
): Map<string, ObdRepository> {
  const map = new Map<string, ObdRepository>()
  for (const s of scenarios) {
    const transport = createElm327TcpClient({
      host: s.host,
      port: s.port,
      onTrace: trace ? createConsoleTracer(s.id) : undefined,
    })
    map.set(s.id, new Elm327TcpRepository(transport, vehicleRepo, logger, { readOnly }))
  }
  return map
}

/** Dependencias que comparten los tres modos de conexion. */
export interface CreateDiagnosisServiceOptions {
  readonly config: AppConfig
  readonly llmClient: LlmClientPort | undefined
  readonly knowledgeStack: KnowledgeStack | undefined
  readonly webSearch: WebSearchPort | undefined
  readonly vehicleRepo: VehicleRepository
  readonly logger: LoggerPort
}

/** Lo que cada modo aporta al {@link DiagnosisService}, mas alla de lo comun. */
type ObdWiring = Pick<
  ConstructorParameters<typeof DiagnosisService>[0],
  'scenarios' | 'obdRepos' | 'obdRepo' | 'directScenario'
>

/** Modo docker: los tres vehiculos emulados, cada uno con su repositorio TCP. */
function wireDockerMode(opts: CreateDiagnosisServiceOptions): ObdWiring {
  const { config, vehicleRepo, logger } = opts
  const scenarios = createDockerScenarios(config)
  return {
    scenarios,
    obdRepos: createObdRepoMap(
      scenarios,
      vehicleRepo,
      logger,
      config.OBD_TRACE,
      config.OBD_READ_ONLY,
    ),
  }
}

/** Modo serie: un unico ELM327 por cable USB, con negociacion de sesion. */
function wireSerialMode(opts: CreateDiagnosisServiceOptions): ObdWiring {
  const { config, vehicleRepo, logger } = opts
  const transport = createElm327SerialClient({
    path: config.SERIAL_PORT_PATH,
    baudRate: config.SERIAL_BAUD_RATE,
    initCommands: ELM327_INIT_COMMANDS,
    initTimeoutMs: ELM327_INIT_TIMEOUT_MS,
    onTrace: config.OBD_TRACE ? createConsoleTracer('serie') : undefined,
  })
  return {
    scenarios: [],
    obdRepo: new Elm327TcpRepository(transport, vehicleRepo, logger, {
      readOnly: config.OBD_READ_ONLY,
    }),
    directScenario: SERIAL_DIRECT_SCENARIO,
  }
}

/**
 * Modo tcp: dongle WiFi real. Negocia igual que el serie.
 *
 * No se unifica con {@link wireSerialMode} pese al parecido: la regla DRY del proyecto
 * pide tres repeticiones y aqui hay dos. Los escenarios docker se construyen en
 * {@link createObdRepoMap} y siguen sin negociar nada.
 */
function wireTcpMode(opts: CreateDiagnosisServiceOptions): ObdWiring {
  const { config, vehicleRepo, logger } = opts
  const transport = createElm327TcpClient({
    host: config.ELM327_HOST,
    port: config.ELM327_PORT,
    initCommands: ELM327_INIT_COMMANDS,
    initTimeoutMs: ELM327_INIT_TIMEOUT_MS,
    onTrace: config.OBD_TRACE ? createConsoleTracer('wifi') : undefined,
  })
  return {
    scenarios: [],
    obdRepo: new Elm327TcpRepository(transport, vehicleRepo, logger, {
      readOnly: config.OBD_READ_ONLY,
    }),
  }
}

/** Crea el servicio de diagnostico con el repositorio OBD adecuado segun el modo. */
export function createDiagnosisService(opts: CreateDiagnosisServiceOptions): DiagnosisService {
  const { llmClient, knowledgeStack, webSearch, vehicleRepo, logger } = opts
  const wiring =
    opts.config.OBD_MODE === 'docker'
      ? wireDockerMode(opts)
      : opts.config.OBD_MODE === 'serial'
        ? wireSerialMode(opts)
        : wireTcpMode(opts)

  return new DiagnosisService({
    ...wiring,
    llmClient,
    logger,
    knowledgeStack,
    webSearch,
    vehicleRepo,
  })
}
