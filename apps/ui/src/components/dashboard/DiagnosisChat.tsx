import { useState, useCallback, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ConversationItem } from '@/lib/api'
import type { CognitiveDiagnosisError } from './useCognitiveDiagnosis'
import { isSeverity } from './severityMeta'
import type { Severity } from './types'

interface DiagnosisChatProps {
  readonly severity: string | null
  readonly confidence: number | null
  readonly conversationHistory: ConversationItem[]
  readonly loading: boolean
  readonly error: CognitiveDiagnosisError | null
  readonly onSend: (query: string) => void
  readonly onLaunchDiagnosis: () => void
  readonly canLaunch: boolean
}

/**
 * El chat mantiene sus propias etiquetas y variantes: aquí se pintan en caja
 * baja y con el sistema de `variant` de shadcn, no con los colores del informe.
 * Lo que sí se comparte es el guard, que es donde estaba la duplicación real.
 */
type SeverityKey = Severity

const SEVERITY_LABELS: Record<SeverityKey, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
}

const SEVERITY_VARIANTS: Record<SeverityKey, 'default' | 'secondary' | 'destructive'> = {
  low: 'default',
  medium: 'secondary',
  high: 'destructive',
  critical: 'destructive',
}

/**
 * Superficie única del diagnóstico asistido por IA. Decide su estado con las
 * mismas señales que ya tenía el chat: `conversationHistory` y `loading`:
 *
 * - vacío: sin historial ni loading → CTA "Lanzar diagnóstico IA" + contexto.
 * - generando (primer diagnóstico): `loading` sin historial → spinner + texto;
 *   el input queda deshabilitado.
 * - diagnóstico: historial > 0 → el output del LLM es el primer mensaje y el
 *   input queda habilitado para el follow-up.
 * - follow-up en curso: historial > 0 y `loading` → el hilo se mantiene visible
 *   y el indicador de carga aparece debajo, sin reemplazar la conversación.
 */
export function DiagnosisChat({
  severity,
  confidence,
  conversationHistory,
  loading,
  error,
  onSend,
  onLaunchDiagnosis,
  canLaunch,
}: DiagnosisChatProps) {
  const [query, setQuery] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = query.trim()
    if (!trimmed || loading) return
    onSend(trimmed)
    setQuery('')
  }, [query, loading, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSend()
    },
    [handleSend],
  )

  const severityKey = severity && isSeverity(severity) ? severity : null
  const showInput = loading || conversationHistory.length > 0

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
        Diagnóstico IA
      </h3>

      {conversationHistory.length === 0 ? (
        loading ? (
          <GeneratingState />
        ) : (
          <EmptyState canLaunch={canLaunch} onLaunchDiagnosis={onLaunchDiagnosis} />
        )
      ) : (
        <>
          <ConversationThread
            conversationHistory={conversationHistory}
            severity={severity}
            severityKey={severityKey}
            confidence={confidence}
          />
          {loading && <GeneratingState />}
        </>
      )}

      {error && !loading && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {showInput && (
        <FollowUpInput
          query={query}
          onChange={setQuery}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
          disabled={loading}
        />
      )}
    </div>
  )
}

function EmptyState({
  canLaunch,
  onLaunchDiagnosis,
}: {
  readonly canLaunch: boolean
  readonly onLaunchDiagnosis: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-white/10 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        El asistente revisará DTCs, datos en vivo, freeze frames y ECUs del vehículo seleccionado.
      </p>
      <Button onClick={onLaunchDiagnosis} disabled={!canLaunch}>
        Lanzar diagnóstico IA
      </Button>
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Analizando datos OBD-II con IA…
    </div>
  )
}

function ConversationThread({
  conversationHistory,
  severity,
  severityKey,
  confidence,
}: {
  readonly conversationHistory: ConversationItem[]
  readonly severity: string | null
  readonly severityKey: SeverityKey | null
  readonly confidence: number | null
}) {
  return (
    <div className="flex max-h-[26rem] min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      {conversationHistory.map((item, i) => {
        if (item.__type === 'user_message' && item.content) {
          return (
            <div
              key={`user-${i}-${item.content}`}
              className="self-end rounded-lg bg-primary/20 px-3 py-1.5 text-sm text-foreground/90 max-w-[80%]"
            >
              {item.content}
            </div>
          )
        }
        if (
          item.__type === 'raw_response' &&
          item.data &&
          typeof item.data === 'object' &&
          'text' in item.data &&
          typeof item.data.text === 'string'
        ) {
          // El badge de severidad/confianza solo se pega a la ÚLTIMA
          // burbuja del asistente: es la única que le corresponde, las
          // anteriores ya quedaron resueltas en su propio turno.
          const isLastItem = i === conversationHistory.length - 1
          return (
            <div
              key={`resp-${i}-${item.data.text}`}
              className="self-start rounded-lg bg-white/5 px-3 py-1.5 text-sm text-foreground/80 max-w-[80%]"
            >
              {isLastItem && (severity || confidence !== null) && (
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {severity && (
                    <Badge
                      variant={severityKey ? SEVERITY_VARIANTS[severityKey] : 'default'}
                      className="text-[10px] uppercase tracking-wider"
                    >
                      {severityKey ? SEVERITY_LABELS[severityKey] : severity}
                    </Badge>
                  )}
                  {confidence !== null && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Confianza: {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
              )}
              <div className="[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground/95 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
                <ReactMarkdown>{item.data.text}</ReactMarkdown>
              </div>
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

function FollowUpInput({
  query,
  onChange,
  onKeyDown,
  onSend,
  disabled,
}: {
  readonly query: string
  readonly onChange: (value: string) => void
  readonly onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  readonly onSend: () => void
  readonly disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Pregunta al mecánico..."
        disabled={disabled}
        className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none disabled:opacity-50"
      />
      <Button onClick={onSend} disabled={disabled || !query.trim()} size="sm">
        Enviar
      </Button>
    </div>
  )
}
