/**
 * Mensajes de estado de los paneles de ECU.
 *
 * Compartidos por `EcuInfoPanel` (tabla) y `TopologyMapPanel` (mapa): son dos
 * vistas del mismo `EcuInfo[]`, asi que deben decir exactamente lo mismo cuando
 * no hay vehiculo, no hay datos o estan cargando. Tenerlos duplicados hacia que
 * cambiar uno dejara al otro descolgado.
 */
export const ECU_PANEL_MESSAGES = {
  noVehicle: 'Selecciona un vehículo para ver sus ECUs',
  loading: 'Cargando ECUs…',
  noEcus: 'Sin ECUs descubiertas',
} as const
