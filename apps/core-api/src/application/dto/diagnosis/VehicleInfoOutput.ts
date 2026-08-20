/** Identificacion del vehiculo activo, con los campos derivados del VO `Vin`. */
export interface VehicleInfoOutput {
  readonly vin: string
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  /** Fabricante deducido del WMI; `null` si el VIN no es decodificable. */
  readonly manufacturer: string | null
  /** Pais/region deducidos del WMI; `null` si el VIN no es decodificable. */
  readonly region: { country: string; region: string } | null
  /** Anio de modelo deducido de la posicion 10; `null` si el VIN no es decodificable. */
  readonly modelYearDecoded: number | null
  /** Estado de la lectura del VIN. */
  readonly vinStatus: 'read' | 'unsupported' | 'unreadable'
}
