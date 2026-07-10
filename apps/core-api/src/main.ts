import { ObdSimulator } from '@/infrastructure/hardware-simulator/obdSimulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/hardware-simulator/obdSimulatorRepository.js'
import { processVehicleDiagnosis } from '@/usecases/diagnostics/processVehicleDiagnosis.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'
import type { LiveData } from '@/domain/entities/liveData.js'

const audiIdleData: LiveData = {
  rpm: 750,
  coolantTemp: 90,
  speed: 0,
  intakeTemp: 25,
}

const defaultScenario: SimulationScenario = {
  id: 'audi-a3-idle',
  name: 'Audi A3 al ralentí',
  vehicleType: 'car',
  sensorValues: audiIdleData,
  dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
}

async function main(): Promise<void> {
  const simulator = new ObdSimulator(defaultScenario)
  const repository = new ObdSimulatorRepository(simulator)
  const diagnosis = await processVehicleDiagnosis(repository)

  console.log(JSON.stringify(diagnosis, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
