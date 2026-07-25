/** Tipo de unidad de control electrónica. */
export enum EcuType {
  ECM = 'ECM',
  TCU = 'TCU',
  ABS = 'ABS',
  HVAC = 'HVAC',
  BMS = 'BMS',
  OTHER = 'OTHER',
}

/** Información de una ECU descubierta en el bus CAN/OBD. */
export interface EcuInfo {
  readonly id?: number
  readonly vehicleId: number
  readonly name: string
  readonly requestAddr: string
  readonly responseAddr: string
  readonly type: EcuType
  readonly protocol: string
  readonly discoveredAt?: string
}
