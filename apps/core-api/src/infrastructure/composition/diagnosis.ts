import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import {
  Elm327TcpRepository,
  type Elm327RepositoryOptions,
} from '@/infrastructure/elm327/elm327Adapter.js'
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
import { createDockerScenarios } from '@/infrastructure/composition/scenarios.js'

/**
 * Composicion del servicio de diagnostico: elige como se llega al vehiculo segun
 * `OBD_MODE` y monta el servicio con ese acceso.
 *
 * Los vehiculos emulados que consume el modo docker son datos y viven en
 * `composition/scenarios.ts`.
 */

/**
 * Decide si el adaptador se monta en solo lectura.
 *
 * `OBD_READ_ONLY` puede activarlo en cualquier modo, pero **no puede desactivarlo
 * cuando hay un vehiculo real al otro lado del cable**: el borrado de DTC (Mode 04)
 * es la unica escritura del sistema y en un coche es irreversible —elimina codigos
 * y freeze frames y reinicia los monitores de emisiones—. Depender de que alguien
 * se acuerde de poner la variable antes de enchufar era la proteccion mas fragil
 * posible: el olvido no avisa.
 *
 * Contra el emulador la variable manda, porque ahi el escenario se regenera al
 * reiniciar el contenedor y la demo web usa el boton con normalidad.
 */
function resolveReadOnly(config: AppConfig): Required<Elm327RepositoryOptions> {
  if (config.OBD_MODE !== 'docker') {
    return {
      readOnly: true,
      readOnlyReason:
        `a real vehicle is connected (OBD_MODE=${config.OBD_MODE}), where clearing DTCs ` +
        'is irreversible — it wipes freeze frames and resets the emissions monitors',
    }
  }
  return {
    readOnly: config.OBD_READ_ONLY,
    readOnlyReason: 'OBD_READ_ONLY is enabled',
  }
}

/** Mapa scenarioId → ObdRepository creado a partir de los descriptores de escenarios. */
function createObdRepoMap(
  scenarios: ScenarioDescriptor[],
  vehicleRepo: VehicleRepository,
  logger: LoggerPort,
  trace = false,
  policy: Elm327RepositoryOptions = {},
): Map<string, ObdRepository> {
  const map = new Map<string, ObdRepository>()
  for (const s of scenarios) {
    const transport = createElm327TcpClient({
      host: s.host,
      port: s.port,
      onTrace: trace ? createConsoleTracer(s.id) : undefined,
    })
    map.set(s.id, new Elm327TcpRepository(transport, vehicleRepo, logger, policy))
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
      resolveReadOnly(config),
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
    obdRepo: new Elm327TcpRepository(transport, vehicleRepo, logger, resolveReadOnly(config)),
    directScenario: SERIAL_DIRECT_SCENARIO,
  }
}

/**
 * Modo tcp: dongle WiFi real. Negocia igual que el serie.
 *
 * No se unifica con {@link wireSerialMode} pese al parecido: la regla DRY del proyecto
 * pide tres repeticiones y aqui hay dos. Los escenarios docker se cablean en
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
    obdRepo: new Elm327TcpRepository(transport, vehicleRepo, logger, resolveReadOnly(config)),
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
