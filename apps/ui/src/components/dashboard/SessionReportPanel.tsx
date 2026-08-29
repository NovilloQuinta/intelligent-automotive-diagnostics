import { Activity, Brain, Cpu, FileText, Loader2, Snowflake, Wrench } from 'lucide-react'
import { useSessionReport, type SessionReportState } from './useSessionReport'
import { severityMeta, isSeverity } from './severityMeta'
import { EcuTable } from './EcuInfoPanel'
import { FrameTable } from './FreezeFramePanel'
import { useAvailablePids } from './useAvailablePids'
import { buildPidLabelMap, type PidLabel } from './pidCatalog'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CognitiveOutput } from '@/lib/api'
import type { Scenario } from './types'

const ANIM_DELAY_TABLE_MS = 60
const ANIM_DELAY_LIST_MS = 50

interface SessionReportPanelProps {
  readonly scenarioId?: string
  readonly vehicleInfo?: Scenario['vehicleInfo']
  /** Pre-computed report state to render without network requests (history mode). */
  readonly snapshot?: SessionReportState
  /** ISO timestamp of when the report was originally generated. Displayed in the header. */
  readonly generatedAt?: string
}

/**
 * Traduce la severidad que llega del backend, que es `string` en el DTO.
 *
 * Reusa `severityMeta`, el mismo mapa que ya usan el chat y el historial: aquí
 * había una tabla propia con las claves en español que nunca casaba con el enum
 * en inglés, así que toda severidad caía al mismo color de respaldo.
 */
function cognitiveSeverityBadge(sev: string): { label: string; color: string } {
  const { label, color } = severityMeta(isSeverity(sev) ? sev : 'low')
  return { label, color }
}

function ReportHeader({
  vehicleInfo,
  generatedAt,
}: {
  readonly vehicleInfo?: Scenario['vehicleInfo']
  readonly generatedAt?: string
}) {
  if (!vehicleInfo) {
    return (
      <div className="text-sm text-muted-foreground">Información del vehículo no disponible</div>
    )
  }

  const isHistorical = !!generatedAt

  const dateStr = isHistorical
    ? new Date(generatedAt!).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          {vehicleInfo.make} <span className="text-primary">{vehicleInfo.model}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {vehicleInfo.year} &middot; {vehicleInfo.engineType}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="mono text-xs text-muted-foreground">VIN: {vehicleInfo.vin}</span>
        {isHistorical ? (
          <span className="text-xs text-primary/80">Informe generado el {dateStr}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{dateStr}</span>
        )}
      </div>
    </div>
  )
}

function DtcTable({ dtcCodes }: { readonly dtcCodes: { code: string; description: string }[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Códigos DTC ({dtcCodes.length})
      </h4>
      <Table>
        <TableHeader>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Código
            </TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Descripción
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dtcCodes.map((dtc, i) => (
            <TableRow
              key={dtc.code}
              className="fade-up border-white/5 hover:bg-white/[0.02]"
              style={{ animationDelay: `${i * ANIM_DELAY_TABLE_MS}ms` }}
            >
              <TableCell className="mono text-xs font-bold text-foreground/90">
                {dtc.code}
              </TableCell>
              <TableCell className="text-xs text-foreground/70">{dtc.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DeterministicSection({ state }: { readonly state: SessionReportState }) {
  const { deterministic, deterministicLoading, deterministicError } = state
  const sevMeta = deterministic ? severityMeta(deterministic.severity) : null

  return (
    <SectionCard icon={Wrench} title="Diagnóstico Determinista">
      {deterministicLoading && <SectionLoading text="Ejecutando diagnóstico…" />}
      {deterministicError && !deterministicLoading && <SectionError text={deterministicError} />}
      {deterministic && !deterministicLoading && sevMeta && (
        <div className="space-y-4">
          {/* Severity badge + diagnosis text */}
          <div
            className="fade-up flex gap-3 rounded-lg border p-4 text-sm leading-relaxed"
            style={{
              background: sevMeta.bg,
              borderColor: sevMeta.border,
            }}
          >
            <span className="mt-0.5 h-5 w-5 shrink-0" style={{ color: sevMeta.color }}>
              <sevMeta.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <span
                className="mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  color: sevMeta.color,
                  borderColor: sevMeta.border,
                  background: sevMeta.bg,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: sevMeta.color,
                    boxShadow: `0 0 6px ${sevMeta.color}`,
                  }}
                />
                {sevMeta.label}
              </span>
              <p className="whitespace-pre-line text-foreground/90">
                {deterministic.diagnosisText}
              </p>
            </div>
          </div>
          {deterministic.dtcCodes.length > 0 && <DtcTable dtcCodes={deterministic.dtcCodes} />}
        </div>
      )}
      {!deterministic && !deterministicLoading && !deterministicError && (
        <SectionEmpty text="Esperando datos del diagnóstico…" />
      )}
    </SectionCard>
  )
}

function EcuSection({ state }: { readonly state: SessionReportState }) {
  const { ecus, ecusLoading } = state

  if (ecus === null && !ecusLoading) return null

  return (
    <SectionCard icon={Cpu} title="ECUs Descubiertas">
      {ecusLoading && <SectionLoading text="Cargando ECUs…" />}
      {ecus && ecus.length > 0 && !ecusLoading && <EcuTable ecus={ecus} />}
      {ecus && ecus.length === 0 && !ecusLoading && <SectionEmpty text="Sin ECUs descubiertas" />}
    </SectionCard>
  )
}

function FreezeFrameSection({
  state,
  pidInfo,
}: {
  readonly state: SessionReportState
  readonly pidInfo: ReadonlyMap<string, PidLabel>
}) {
  const { freezeFrame, freezeFrameLoading } = state

  if (freezeFrame === null && !freezeFrameLoading) return null

  return (
    <SectionCard icon={Snowflake} title="Freeze Frame">
      {freezeFrameLoading && <SectionLoading text="Cargando freeze frame…" />}
      {freezeFrame && !freezeFrameLoading && (
        <div className="space-y-2">
          <div className="mono text-xs text-muted-foreground">
            DTC: <span className="text-foreground/80">{freezeFrame.dtcCode}</span>
          </div>
          <FrameTable pidValues={freezeFrame.pidValues} pidInfo={pidInfo} />
        </div>
      )}
      {!freezeFrame && !freezeFrameLoading && (
        <SectionEmpty text="Sin freeze frame para este escenario" />
      )}
    </SectionCard>
  )
}

function RecommendationsList({ recommendations }: { readonly recommendations: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recomendaciones
      </h4>
      <ul className="space-y-1.5">
        {recommendations.map((rec, i) => (
          <li
            key={i}
            className="fade-up flex items-start gap-2 text-sm text-foreground/80"
            style={{ animationDelay: `${i * ANIM_DELAY_LIST_MS}ms` }}
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {rec}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ToolCallsTrace({ toolCalls }: { readonly toolCalls: CognitiveOutput['toolCalls'] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="tool-trace" className="rounded-lg border border-white/10">
        <AccordionTrigger className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:text-foreground">
          <FileText className="mr-2 h-3.5 w-3.5 text-primary" />
          Traza de herramientas ({toolCalls.length})
        </AccordionTrigger>
        <AccordionContent className="px-4">
          <div className="space-y-3">
            {toolCalls.map((call, i) => (
              <div key={i} className="rounded-md border border-white/5 bg-black/20 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Activity className="h-3 w-3 text-primary" />
                  <span className="mono text-[11px] font-bold text-foreground/80">{call.tool}</span>
                </div>
                <p className="mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                  {call.result}
                </p>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function CognitiveSection({ state }: { readonly state: SessionReportState }) {
  const { cognitive, cognitiveLoading, cognitiveError, capabilities } = state
  const isUnavailable =
    capabilities && !capabilities.cognitiveDiagnosis && cognitive === 'unavailable'

  return (
    <SectionCard icon={Brain} title="Diagnóstico Cognitivo">
      {cognitiveLoading && <SectionLoading text="Analizando con IA…" />}
      {cognitiveError && !cognitiveLoading && <SectionError text={cognitiveError} />}
      {isUnavailable && <SectionEmpty text="Diagnóstico cognitivo no disponible" />}
      {cognitive &&
        typeof cognitive === 'object' &&
        !cognitiveLoading &&
        (() => {
          const cogSev = cognitiveSeverityBadge(cognitive.severity)
          return (
            <div className="space-y-4">
              {/* Narrative + badges */}
              <div className="fade-up rounded-lg border border-white/10 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      color: cogSev.color,
                      borderColor: cogSev.color,
                      background: `${cogSev.color}15`,
                    }}
                  >
                    {cogSev.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    Confianza: {Math.round(cognitive.confidence * 100)} %
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {cognitive.diagnosis}
                </p>
              </div>
              {cognitive.recommendations.length > 0 && (
                <RecommendationsList recommendations={cognitive.recommendations} />
              )}
              {cognitive.toolCalls.length > 0 && <ToolCallsTrace toolCalls={cognitive.toolCalls} />}
            </div>
          )
        })()}
      {!cognitive && !cognitiveLoading && !cognitiveError && !isUnavailable && (
        <SectionEmpty text="Esperando datos del diagnóstico cognitivo…" />
      )}
    </SectionCard>
  )
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly title: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function SectionLoading({ text }: { readonly text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      {text}
    </div>
  )
}

function SectionError({ text }: { readonly text: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {text}
    </div>
  )
}

function SectionEmpty({ text }: { readonly text: string }) {
  return (
    <div className="flex min-h-[60px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

// Internal: renders the report from a given state (live or snapshot)

interface SessionReportContentProps {
  readonly state: SessionReportState
  readonly vehicleInfo?: Scenario['vehicleInfo']
  readonly generatedAt?: string
  readonly pidInfo: ReadonlyMap<string, PidLabel>
}

function SessionReportContent({
  state,
  vehicleInfo,
  generatedAt,
  pidInfo,
}: SessionReportContentProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold uppercase tracking-wider text-foreground/90">
        Informe de Sesión de Diagnóstico
      </h2>
      <div className="panel p-5">
        <ReportHeader vehicleInfo={vehicleInfo} generatedAt={generatedAt} />
      </div>
      <DeterministicSection state={state} />
      <EcuSection state={state} />
      <FreezeFrameSection state={state} pidInfo={pidInfo} />
      <CognitiveSection state={state} />
    </div>
  )
}

// Main component — decides between live fetching and snapshot rendering

/**
 * Full-session report panel that aggregates deterministic OBD-II diagnosis,
 * ECU discovery, freeze frame snapshots, and optional cognitive AI analysis.
 *
 * In **live mode** (no `snapshot` prop), it calls `useSessionReport(scenarioId)`
 * to fetch data from the backend in parallel.
 *
 * In **history mode** (`snapshot` prop provided), it renders directly from the
 * pre-saved state without making any network requests.
 */
export function SessionReportPanel(props: SessionReportPanelProps) {
  const { scenarioId, vehicleInfo, snapshot, generatedAt } = props

  const pidInfo = buildPidLabelMap(useAvailablePids())

  // History mode — render directly from snapshot (no network calls)
  if (snapshot) {
    return (
      <SessionReportContent
        state={snapshot}
        vehicleInfo={vehicleInfo}
        generatedAt={generatedAt}
        pidInfo={pidInfo}
      />
    )
  }

  // Live mode — fetch data via hook
  return (
    <SessionReportPanelLive scenarioId={scenarioId!} vehicleInfo={vehicleInfo} pidInfo={pidInfo} />
  )
}

function SessionReportPanelLive({
  scenarioId,
  vehicleInfo,
  pidInfo,
}: {
  readonly scenarioId: string
  readonly vehicleInfo?: Scenario['vehicleInfo']
  readonly pidInfo: ReadonlyMap<string, PidLabel>
}) {
  const state = useSessionReport(scenarioId)

  return <SessionReportContent state={state} vehicleInfo={vehicleInfo} pidInfo={pidInfo} />
}
