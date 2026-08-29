import { useState } from 'react'
import { CheckCircle2, CircuitBoard, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DiagnosisResponse, DtcCode, Severity } from './types'
import { COLORS, DTC_COLORS, SVG_STROKES } from './types'
import { severityMeta } from './severityMeta'
import { usePendingDtc } from './usePendingDtc'
import { usePermanentDtc } from './usePermanentDtc'
import { useClearDtc } from './useClearDtc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const DEFAULT_SEVERITY: Severity = 'medium'

interface Props {
  codes: DiagnosisResponse['dtcCodes'] | null
  severity: Severity | null
  empty: boolean
  selectedCode: string | null
  onSelect: (code: string) => void
  scenarioId: string
  /** Re-ejecuta el diagnóstico determinista (refresca la pestaña "Almacenadas") tras borrar averías. */
  onDiagnose?: () => void
}

function EmptyPrompt() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO</span>
    </div>
  )
}

function NoCodesMessage() {
  return (
    <div
      className="fade-up flex items-center gap-3 rounded-lg border p-4 text-sm"
      style={{
        background: DTC_COLORS.noCodesBg,
        borderColor: DTC_COLORS.noCodesBorder,
        color: COLORS.accentMuted,
      }}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: COLORS.accent }} />
      <span>Ningún código de error — el vehículo no presenta fallos registrados.</span>
    </div>
  )
}

function CodeList({
  codes,
  severity,
  selectedCode,
  onSelect,
}: {
  codes: DtcCode[]
  severity: Severity | null
  selectedCode: string | null
  onSelect: (code: string) => void
}) {
  const meta = severityMeta(severity ?? DEFAULT_SEVERITY)
  return (
    <ul className="space-y-2">
      {codes.map((c, i) => {
        const selected = c.code === selectedCode
        return (
          <li
            key={c.code}
            className={`fade-up flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
              selected
                ? 'border-primary/60 bg-primary/10'
                : 'border-white/5 bg-black/30 hover:bg-white/[0.03]'
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onSelect(c.code)}
            aria-selected={selected}
          >
            <span
              className="mono inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-sm font-bold"
              style={{
                background: COLORS.primary,
                color: COLORS.background,
                boxShadow: selected ? SVG_STROKES.dtcGlow : 'none',
              }}
            >
              {c.code}
            </span>
            <span className="flex-1 text-sm text-foreground/90">{c.description}</span>
            <meta.icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
          </li>
        )
      })}
    </ul>
  )
}

function ClearDtcDialog({ scenarioId, onCleared }: { scenarioId: string; onCleared: () => void }) {
  const { clearDtc, loading } = useClearDtc()
  const [open, setOpen] = useState(false)

  const handleConfirm = async () => {
    try {
      const cleared = await clearDtc(scenarioId)
      if (cleared) {
        toast.success('Averías borradas', {
          description:
            'Los códigos y freeze frames han sido eliminados. Los monitores de emisiones se han reiniciado.',
        })
        onCleared()
      } else {
        toast.error('No se pudieron borrar las averías')
      }
    } catch {
      toast.error('Error al borrar las averías')
    } finally {
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          Borrar averías
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Borrar averías</AlertDialogTitle>
          <AlertDialogDescription>
            Se borrarán las averías y sus freeze frames. Los monitores de emisiones se reiniciarán.
            Las averías permanentes no se borran.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? 'Borrando...' : 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Lista de codigos DTC con severidad y dialogo de confirmacion para borrarlos (freeze frames incluidos). */
export function DtcPanel({
  codes,
  severity,
  empty,
  selectedCode,
  onSelect,
  scenarioId,
  onDiagnose,
}: Props) {
  const { dtcCodes: pendingCodes, refetch: refetchPending } = usePendingDtc(empty ? '' : scenarioId)
  const { dtcCodes: permanentCodes, refetch: refetchPermanent } = usePermanentDtc(
    empty ? '' : scenarioId,
  )
  const storedCodes = codes ?? []

  const handleCleared = () => {
    void refetchPending()
    void refetchPermanent()
    onDiagnose?.()
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <CircuitBoard className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Códigos de Avería</h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {storedCodes.length > 0
            ? `${storedCodes.length} registrado${storedCodes.length === 1 ? '' : 's'}`
            : '—'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {empty && <EmptyPrompt />}
        {!empty && (
          <>
            <Tabs defaultValue="stored">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="stored" className="flex-1 text-xs">
                  Almacenadas
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex-1 text-xs">
                  Pendientes
                </TabsTrigger>
                <TabsTrigger value="permanent" className="flex-1 text-xs">
                  Permanentes
                </TabsTrigger>
              </TabsList>
              <TabsContent value="stored">
                <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                  Averías confirmadas detectadas por la ECU (Modo 03)
                </p>
                {storedCodes.length === 0 ? (
                  <NoCodesMessage />
                ) : (
                  <CodeList
                    codes={storedCodes}
                    severity={severity}
                    selectedCode={selectedCode}
                    onSelect={onSelect}
                  />
                )}
              </TabsContent>
              <TabsContent value="pending">
                <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                  Averías detectadas durante el ciclo de conducción actual (Modo 07)
                </p>
                {pendingCodes.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground/60">Ninguna</p>
                ) : (
                  <CodeList
                    codes={pendingCodes}
                    severity={severity}
                    selectedCode={selectedCode}
                    onSelect={onSelect}
                  />
                )}
              </TabsContent>
              <TabsContent value="permanent">
                <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">
                  Averías que requieren reparación y no pueden borrarse con escáner (Modo 0A)
                </p>
                {permanentCodes.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground/60">Ninguna</p>
                ) : (
                  <CodeList
                    codes={permanentCodes}
                    severity={severity}
                    selectedCode={selectedCode}
                    onSelect={onSelect}
                  />
                )}
              </TabsContent>
            </Tabs>
            <div className="flex justify-end pt-4">
              <ClearDtcDialog scenarioId={scenarioId} onCleared={handleCleared} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
