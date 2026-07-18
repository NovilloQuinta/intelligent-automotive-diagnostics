/** Datos de identificación estática del vehículo bajo diagnóstico. */
export interface VehicleInfo {
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  readonly vin?: string
}
