import { useState } from 'react'
import { Network } from 'lucide-react'
import { COLORS, type DtcCode, type EcuInfo } from './types'
import { AiOriginBadge } from './AiOriginBadge'
import { PanelState } from './PanelState'
import { ECU_PANEL_MESSAGES } from './ecuMessages'
import { getEcuTopologyColor } from './ecuTopologyColors'

/**
 * Geometria del mapa. Se agrupa aqui, como {@link GAUGE} en `types.ts`, para que
 * el JSX no lleve numeros magicos sueltos.
 */
const TOPOLOGY = {
  VIEWBOX_WIDTH: 640,
  VIEWBOX_HEIGHT: 260,
  BUS_Y: 130,
  BUS_MARGIN_X: 56,
  NODE_RADIUS: 22,
  NODE_RADIUS_SELECTED: 26,
  /** Separacion vertical de los nodos respecto a la linea de bus, alternando arriba/abajo. */
  NODE_OFFSET_Y: 58,
  STUB_WIDTH: 2,
  /**
   * La etiqueta va al lado OPUESTO al bus: si fuera siempre debajo, en los nodos
   * de la fila superior el conector al bus le pasaria por encima al texto.
   */
  LABEL_DY_BELOW: 42,
  LABEL_DY_ABOVE: -36,
  /** Alto util cuando no hay ningun nodo por debajo del bus (caso de una sola ECU). */
  VIEWBOX_HEIGHT_TOP_ONLY: 160,
  /** Separacion del anillo de averia respecto al borde del nodo. */
  FAULT_RING_GAP: 6,
  FAULT_RING_WIDTH: 2.5,
} as const

const BUS_STROKE = 'rgba(255,255,255,0.18)'

interface Props {
  readonly ecus: EcuInfo[]
  readonly loading: boolean
  readonly error: string | null
  readonly selectedId: string | null
  /**
   * Averias leidas del bus. Solo marcan nodo las que traen `ecuAddress`: una
   * lectura sin cabeceras no dice de donde viene el codigo, y repartirlo por el
   * mapa seria inventar el dato.
   */
  readonly dtcs?: readonly DtcCode[]
}

interface NodePosition {
  readonly x: number
  readonly y: number
}

/**
 * Reparte las ECUs a lo largo de la linea de bus, alternando por encima y por
 * debajo para que las etiquetas no se solapen.
 *
 * Es una funcion pura de `index` y `total`: no hay estado de posicion, asi que
 * el layout es estable entre renders y no depende del orden de montaje.
 */
function nodePosition(index: number, total: number): NodePosition {
  const { VIEWBOX_WIDTH, BUS_MARGIN_X, BUS_Y, NODE_OFFSET_Y } = TOPOLOGY
  const usableWidth = VIEWBOX_WIDTH - BUS_MARGIN_X * 2
  // Con una sola ECU se centra; con N se reparten en intervalos iguales.
  const x = total === 1 ? VIEWBOX_WIDTH / 2 : BUS_MARGIN_X + (usableWidth * index) / (total - 1)
  const y = index % 2 === 0 ? BUS_Y - NODE_OFFSET_Y : BUS_Y + NODE_OFFSET_Y
  return { x, y }
}

interface EcuNodeProps {
  readonly ecu: EcuInfo
  readonly position: NodePosition
  readonly selected: boolean
  readonly onSelect: (index: number) => void
  readonly index: number
  /** Cuantas averias reporta esta ECU. `0` = sana. */
  readonly faultCount: number
}

/** Cuenta las averias atribuidas a cada ECU por su direccion de respuesta. */
function countFaultsByEcu(dtcs: readonly DtcCode[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const dtc of dtcs) {
    const address = dtc.ecuAddress?.trim().toUpperCase()
    if (!address) continue
    counts.set(address, (counts.get(address) ?? 0) + 1)
  }
  return counts
}

/**
 * Nombre accesible del nodo, con la averia dentro.
 *
 * Va en el nombre y no solo en el color porque el color no lo lee un lector de
 * pantalla, y porque un mapa que solo distingue por tono deja fuera a quien no
 * distingue esos tonos.
 */
function nodeLabel(ecu: EcuInfo, faultCount: number): string {
  const origen = ecu.source === 'ai' ? ' (IA)' : ''
  if (faultCount === 0) return `${ecu.name}${origen}`
  return `${ecu.name}${origen} — ${faultCount} ${faultCount === 1 ? 'averia' : 'averias'}`
}

/** Un nodo esta por encima del bus cuando su y es menor que la linea. */
function isAboveBus(position: NodePosition): boolean {
  return position.y < TOPOLOGY.BUS_Y
}

/**
 * Nodo individual del mapa: linea al bus, circulo coloreado por tipo y etiqueta.
 *
 * Es un `<g>` con `role="button"` para que sea alcanzable por teclado y por
 * nombre accesible — un `<circle>` suelto no lo seria.
 */
function EcuNode({ ecu, position, selected, onSelect, index, faultCount }: EcuNodeProps) {
  const color = getEcuTopologyColor(ecu.type)
  const radius = selected ? TOPOLOGY.NODE_RADIUS_SELECTED : TOPOLOGY.NODE_RADIUS
  const faulty = faultCount > 0

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={nodeLabel(ecu, faultCount)}
      aria-pressed={selected}
      transform={`translate(${position.x}, ${position.y})`}
      className="cursor-pointer focus:outline-none"
      onClick={() => onSelect(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(index)
      }}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={TOPOLOGY.BUS_Y - position.y}
        stroke={color}
        strokeWidth={TOPOLOGY.STUB_WIDTH}
        className={selected ? undefined : 'stub-pulse'}
        opacity={selected ? 0.9 : 0.5}
      />
      {faulty && (
        <circle
          r={radius + TOPOLOGY.FAULT_RING_GAP}
          fill="none"
          stroke={COLORS.destructive}
          strokeWidth={TOPOLOGY.FAULT_RING_WIDTH}
          opacity={0.9}
        />
      )}
      <circle
        r={radius}
        fill={color}
        fillOpacity={selected ? 0.95 : 0.75}
        stroke={faulty ? COLORS.destructive : color}
        strokeWidth={selected ? 3 : 1}
      />
      <text
        textAnchor="middle"
        dy={4}
        className="pointer-events-none fill-black text-[10px] font-bold uppercase"
      >
        {ecu.type}
      </text>
      <text
        textAnchor="middle"
        dy={isAboveBus(position) ? TOPOLOGY.LABEL_DY_ABOVE : TOPOLOGY.LABEL_DY_BELOW}
        className="pointer-events-none fill-current text-[10px] text-foreground/80"
      >
        {ecu.name}
        {ecu.source === 'ai' ? (
          <tspan dx={5} className="fill-primary text-[9px] font-bold">
            <title>Centralita identificada por el diagnóstico cognitivo</title>
            IA
          </tspan>
        ) : null}
      </text>
    </g>
  )
}

/** Tarjeta de detalle de la ECU seleccionada. */
function EcuDetailCard({ ecu }: { readonly ecu: EcuInfo }) {
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-foreground/90">
          {ecu.name}
          {ecu.source === 'ai' ? (
            <AiOriginBadge title="Centralita identificada por el diagnóstico cognitivo" />
          ) : null}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {ecu.type}
        </span>
      </div>
      <div className="mono mt-1 text-xs text-foreground/80">
        {ecu.requestAddr} → {ecu.responseAddr}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{ecu.protocol}</div>
    </div>
  )
}

/**
 * Mapa de topologia del bus CAN: representacion visual de las mismas `EcuInfo`
 * que alimentan {@link EcuInfoPanel}.
 *
 * No consume ningun dato ni endpoint nuevo — es una vista alternativa de lo que
 * el sistema ya expone.
 */
export function TopologyMapPanel({ ecus, loading, error, selectedId, dtcs = [] }: Props) {
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const faultsByEcu = countFaultsByEcu(dtcs)

  const showMap = Boolean(selectedId) && !loading && !error && ecus.length > 0
  // Los nodos impares son los que caen por debajo del bus: con una sola ECU no
  // hay ninguno y la mitad inferior del lienzo quedaria vacia.
  const viewBoxHeight = ecus.length > 1 ? TOPOLOGY.VIEWBOX_HEIGHT : TOPOLOGY.VIEWBOX_HEIGHT_TOP_ONLY
  // El indice puede quedar fuera de rango si cambia el vehiculo: se deriva en
  // render en vez de sincronizarse con un efecto.
  const activeEcu = selectedNode !== null ? (ecus[selectedNode] ?? null) : null

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Topología del Bus</h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">{selectedId ?? '—'}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!selectedId && <PanelState state="empty" message={ECU_PANEL_MESSAGES.noVehicle} />}
        {selectedId && loading && (
          <PanelState state="loading" message={ECU_PANEL_MESSAGES.loading} />
        )}
        {selectedId && !loading && error && <PanelState state="error" message={error} />}
        {selectedId && !loading && !error && ecus.length === 0 && (
          <PanelState state="empty" message={ECU_PANEL_MESSAGES.noEcus} />
        )}

        {showMap && (
          <>
            <svg
              viewBox={`0 0 ${TOPOLOGY.VIEWBOX_WIDTH} ${viewBoxHeight}`}
              className="h-auto w-full"
              role="img"
              aria-label="Mapa de topología del bus CAN"
            >
              {/*
                Dos lineas superpuestas: la base da el cuerpo del bus y la capa
                de trazos animada simula el trafico de datos. Separadas porque
                animar el dash de la propia base la dejaria discontinua cuando
                el usuario pide menos movimiento.
              */}
              <line
                x1={TOPOLOGY.BUS_MARGIN_X / 2}
                y1={TOPOLOGY.BUS_Y}
                x2={TOPOLOGY.VIEWBOX_WIDTH - TOPOLOGY.BUS_MARGIN_X / 2}
                y2={TOPOLOGY.BUS_Y}
                stroke={BUS_STROKE}
                strokeWidth={4}
                strokeLinecap="round"
              />
              <line
                x1={TOPOLOGY.BUS_MARGIN_X / 2}
                y1={TOPOLOGY.BUS_Y}
                x2={TOPOLOGY.VIEWBOX_WIDTH - TOPOLOGY.BUS_MARGIN_X / 2}
                y2={TOPOLOGY.BUS_Y}
                stroke={COLORS.primary}
                strokeWidth={2}
                strokeLinecap="round"
                className="bus-flow"
                opacity={0.7}
                aria-hidden="true"
              />
              {ecus.map((ecu, index) => (
                <EcuNode
                  key={ecu.id !== 0 ? ecu.id : `${ecu.responseAddr}-${index}`}
                  ecu={ecu}
                  index={index}
                  position={nodePosition(index, ecus.length)}
                  selected={selectedNode === index}
                  onSelect={setSelectedNode}
                  faultCount={faultsByEcu.get(ecu.responseAddr.toUpperCase()) ?? 0}
                />
              ))}
            </svg>

            {ecus.length === 1 ? (
              <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
                Se ha descubierto una sola ECU. El descubrimiento depende de los modos OBD que
                soporte el vehículo, así que puede haber más unidades no visibles.
              </p>
            ) : null}

            {activeEcu ? (
              <EcuDetailCard ecu={activeEcu} />
            ) : (
              <p className="px-1 text-[10px] text-muted-foreground">
                Selecciona un nodo para ver sus direcciones y protocolo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
