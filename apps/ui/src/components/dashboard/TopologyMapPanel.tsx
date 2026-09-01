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
  NODE_WIDTH: 34,
  NODE_HEIGHT: 24,
  NODE_WIDTH_SELECTED: 38,
  NODE_HEIGHT_SELECTED: 28,
  NODE_CORNER_RADIUS: 6,
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

const AI_ORIGIN_TITLE = 'Centralita identificada por el diagnóstico cognitivo'

/** Normaliza una direccion CAN para comparar sin distinguir mayusculas/espacios. */
function normalizeEcuAddress(address: string | undefined): string | undefined {
  return address?.trim().toUpperCase()
}

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

/** Estado visual del nodo, agrupado para no superar 4 props en {@link EcuNode}. */
interface EcuNodeStatus {
  readonly selected: boolean
  /** Cuantas averias reporta esta ECU. `0` = sana. */
  readonly faultCount: number
}

interface EcuNodeProps {
  readonly ecu: EcuInfo
  readonly position: NodePosition
  readonly status: EcuNodeStatus
  readonly onSelect: () => void
}

/** Cuenta las averias atribuidas a cada ECU por su direccion de respuesta. */
function countFaultsByEcu(dtcs: readonly DtcCode[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const dtc of dtcs) {
    const address = normalizeEcuAddress(dtc.ecuAddress)
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

/** Anillo rojo alrededor del nodo cuando la ECU reporta alguna averia. */
function FaultRing({ width, height }: { readonly width: number; readonly height: number }) {
  return (
    <rect
      x={-width / 2 - TOPOLOGY.FAULT_RING_GAP}
      y={-height / 2 - TOPOLOGY.FAULT_RING_GAP}
      width={width + TOPOLOGY.FAULT_RING_GAP * 2}
      height={height + TOPOLOGY.FAULT_RING_GAP * 2}
      rx={TOPOLOGY.NODE_CORNER_RADIUS + TOPOLOGY.FAULT_RING_GAP}
      fill="none"
      stroke={COLORS.destructive}
      strokeWidth={TOPOLOGY.FAULT_RING_WIDTH}
      opacity={0.9}
    />
  )
}

/** Tipo dentro del nodo y nombre (con badge IA si aplica) fuera de el. */
function NodeLabels({ ecu, position }: { readonly ecu: EcuInfo; readonly position: NodePosition }) {
  return (
    <>
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
            <title>{AI_ORIGIN_TITLE}</title>
            IA
          </tspan>
        ) : null}
      </text>
    </>
  )
}

/** Linea que conecta el nodo con el bus, con el pulso animado cuando no esta seleccionado. */
function NodeStub({
  color,
  y2,
  selected,
}: {
  readonly color: string
  readonly y2: number
  readonly selected: boolean
}) {
  return (
    <line
      x1={0}
      y1={0}
      x2={0}
      y2={y2}
      stroke={color}
      strokeWidth={TOPOLOGY.STUB_WIDTH}
      className={selected ? undefined : 'stub-pulse'}
      opacity={selected ? 0.9 : 0.5}
    />
  )
}

/**
 * Nodo individual del mapa: linea al bus, rectangulo coloreado por tipo y etiqueta.
 *
 * Es un `<g>` con `role="button"` para que sea alcanzable por teclado y por
 * nombre accesible — un `<rect>` suelto no lo seria.
 */
function EcuNode({ ecu, position, status, onSelect }: EcuNodeProps) {
  const { selected, faultCount } = status
  const color = getEcuTopologyColor(ecu.type)
  const width = selected ? TOPOLOGY.NODE_WIDTH_SELECTED : TOPOLOGY.NODE_WIDTH
  const height = selected ? TOPOLOGY.NODE_HEIGHT_SELECTED : TOPOLOGY.NODE_HEIGHT
  const faulty = faultCount > 0

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={nodeLabel(ecu, faultCount)}
      aria-pressed={selected}
      transform={`translate(${position.x}, ${position.y})`}
      className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
    >
      <NodeStub color={color} y2={TOPOLOGY.BUS_Y - position.y} selected={selected} />
      {faulty && <FaultRing width={width} height={height} />}
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={TOPOLOGY.NODE_CORNER_RADIUS}
        fill={color}
        fillOpacity={selected ? 0.95 : 0.75}
        stroke={faulty ? COLORS.destructive : color}
        strokeWidth={selected ? 3 : 1}
      />
      <NodeLabels ecu={ecu} position={position} />
    </g>
  )
}

/** Tarjeta de detalle de la ECU seleccionada, con sus averias si las reporta. */
function EcuDetailCard({
  ecu,
  faults,
}: {
  readonly ecu: EcuInfo
  readonly faults: readonly DtcCode[]
}) {
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-foreground/90">
          {ecu.name}
          {ecu.source === 'ai' ? <AiOriginBadge title={AI_ORIGIN_TITLE} /> : null}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {ecu.type}
        </span>
      </div>
      <div className="mono mt-1 text-xs text-foreground/80">
        {ecu.requestAddr} → {ecu.responseAddr}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{ecu.protocol}</div>
      {faults.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-white/5 pt-2">
          {faults.map((fault) => (
            <li key={fault.code} className="text-[10px] text-destructive">
              <span className="mono font-bold">{fault.code}</span>
              {fault.description ? ` — ${fault.description}` : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Averias de una ECU concreta por su direccion de respuesta. */
function faultsForEcu(dtcs: readonly DtcCode[], ecu: EcuInfo): DtcCode[] {
  const address = normalizeEcuAddress(ecu.responseAddr)
  return dtcs.filter((dtc) => normalizeEcuAddress(dtc.ecuAddress) === address)
}

/** Estados vacio/carga/error del panel; `null` cuando toca mostrar el mapa. */
function TopologyPanelState({
  selectedId,
  loading,
  error,
  hasEcus,
}: {
  readonly selectedId: string | null
  readonly loading: boolean
  readonly error: string | null
  readonly hasEcus: boolean
}) {
  if (!selectedId) return <PanelState state="empty" message={ECU_PANEL_MESSAGES.noVehicle} />
  if (loading) return <PanelState state="loading" message={ECU_PANEL_MESSAGES.loading} />
  if (error) return <PanelState state="error" message={error} />
  if (!hasEcus) return <PanelState state="empty" message={ECU_PANEL_MESSAGES.noEcus} />
  return null
}

/** Alto util cuando no hay ningun nodo por debajo del bus (caso de una sola ECU). */
function viewBoxHeightFor(ecuCount: number): number {
  return ecuCount > 1 ? TOPOLOGY.VIEWBOX_HEIGHT : TOPOLOGY.VIEWBOX_HEIGHT_TOP_ONLY
}

interface TopologyDiagramProps {
  readonly ecus: EcuInfo[]
  readonly selectedNode: number | null
  readonly onSelect: (index: number) => void
  readonly faultsByEcu: Map<string, number>
}

/**
 * Dos lineas superpuestas: la base da el cuerpo del bus y la capa de trazos
 * animada simula el trafico de datos. Separadas porque animar el dash de la
 * propia base la dejaria discontinua cuando el usuario pide menos movimiento.
 */
function BusLine() {
  return (
    <>
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
    </>
  )
}

/** `EcuInfo.id` de una ECU sin fila persistida todavia: la key cae a la direccion. */
const NO_ECU_ID = 0

/** El `<svg>` del bus y sus nodos, separado para que {@link TopologyMapPanel} quede corto. */
function TopologyDiagram({ ecus, selectedNode, onSelect, faultsByEcu }: TopologyDiagramProps) {
  return (
    <svg
      viewBox={`0 0 ${TOPOLOGY.VIEWBOX_WIDTH} ${viewBoxHeightFor(ecus.length)}`}
      className="h-auto w-full"
      role="img"
      aria-label="Mapa de topología del bus CAN"
    >
      <BusLine />
      {ecus.map((ecu, index) => (
        <EcuNode
          key={ecu.id !== NO_ECU_ID ? ecu.id : `${ecu.responseAddr}-${index}`}
          ecu={ecu}
          position={nodePosition(index, ecus.length)}
          onSelect={() => onSelect(index)}
          status={{
            selected: selectedNode === index,
            faultCount: faultsByEcu.get(normalizeEcuAddress(ecu.responseAddr) ?? '') ?? 0,
          }}
        />
      ))}
    </svg>
  )
}

/** Nota bajo el mapa: aviso de ECU unica, o la ficha de la seleccionada. */
function TopologyFootnote({
  singleEcu,
  activeEcu,
  faults,
}: {
  readonly singleEcu: boolean
  readonly activeEcu: EcuInfo | null
  readonly faults: DtcCode[]
}) {
  return (
    <>
      {singleEcu ? (
        <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
          Se ha descubierto una sola ECU. El descubrimiento depende de los modos OBD que soporte el
          vehículo, así que puede haber más unidades no visibles.
        </p>
      ) : null}
      {activeEcu ? (
        <EcuDetailCard ecu={activeEcu} faults={faults} />
      ) : (
        <p className="px-1 text-[10px] text-muted-foreground">
          Selecciona un nodo para ver sus direcciones y protocolo.
        </p>
      )}
    </>
  )
}

/** Cabecera del panel: titulo y escenario activo. */
function TopologyHeader({ selectedId }: { readonly selectedId: string | null }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Topología del Bus</h3>
      </div>
      <span className="mono text-[10px] text-muted-foreground">{selectedId ?? '—'}</span>
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
  // El indice puede quedar fuera de rango si cambia el vehiculo: se deriva en
  // render en vez de sincronizarse con un efecto.
  const activeEcu = selectedNode !== null ? (ecus[selectedNode] ?? null) : null

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <TopologyHeader selectedId={selectedId} />

      <div className="min-h-0 flex-1 overflow-auto">
        <TopologyPanelState
          selectedId={selectedId}
          loading={loading}
          error={error}
          hasEcus={ecus.length > 0}
        />

        {showMap && (
          <>
            <TopologyDiagram
              ecus={ecus}
              selectedNode={selectedNode}
              onSelect={setSelectedNode}
              faultsByEcu={faultsByEcu}
            />
            <TopologyFootnote
              singleEcu={ecus.length === 1}
              activeEcu={activeEcu}
              faults={activeEcu ? faultsForEcu(dtcs, activeEcu) : []}
            />
          </>
        )}
      </div>
    </div>
  )
}
