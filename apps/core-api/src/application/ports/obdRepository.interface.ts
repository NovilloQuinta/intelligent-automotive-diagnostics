import type { LiveData } from '@/domain/entities/liveData.js'
import type { DtcCode } from '@/domain/entities/dtcCode.js'

/** Contrato para la adquisición de datos OBD-II desde el hardware. */
export interface ObdRepository {
  readLiveData(): Promise<LiveData>
  readDtcCodes(): Promise<DtcCode[]>
  setPower(on: boolean): Promise<void>
}
