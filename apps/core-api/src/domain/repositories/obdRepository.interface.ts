import type { LiveData } from '../entities/liveData.js'
import type { DtcCode } from '../entities/dtcCode.js'

export interface ObdRepository {
  readLiveData(): Promise<LiveData>
  readDtcCodes(): Promise<DtcCode[]>
  setPower(on: boolean): Promise<void>
}
