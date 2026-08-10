import { useState, useCallback, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { ConversationItem } from '@/lib/api'
import type { CognitiveDiagnosisError } from './useCognitiveDiagnosis'

interface MechanicChatProps {
  readonly diagnosisText: string | null
  readonly severity: string | null
  readonly confidence: number | null
  readonly conversationHistory: ConversationItem[]
  readonly loading: boolean
  readonly error: CognitiveDiagnosisError | null
  readonly onSend: (query: string) => void
}

type SeverityKey = 'low' | 'medium' | 'high' | 'critical'

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

function isSeverityKey(v: string): v is SeverityKey {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'critical'
}

export function MechanicChat({
  diagnosisText,
  severity,
  confidence,
  conversationHistory,
  loading,
  error,
  onSend,
}: MechanicChatProps) {
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

  const severityKey = severity && isSeverityKey(severity) ? severity : null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
        Chat con el Mecánico
      </h3>

      {conversationHistory.length > 0 && !loading && (
        <div className="flex min-h-0 flex-col gap-2 pr-1">
          {conversationHistory.map((item, i) => {
            if (item.__type === 'user_message' && item.content) {
              return (
                <div
                  key={`user-${i}`}
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
                  key={`resp-${i}`}
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
      )}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pregunta al mecánico..."
          disabled={loading}
          className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none disabled:opacity-50"
        />
        <Button onClick={handleSend} disabled={loading || !query.trim()} size="sm">
          Enviar
        </Button>
      </div>
    </div>
  )
}
