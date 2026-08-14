import { useEffect, useRef, useState } from 'react'
import { api, GENERIC_ERROR_MESSAGE, type ConversationItem } from '@/lib/api'
import { ApiHttpError } from '@/lib/api-errors'
import { pidObservationToRow, type PidRow } from './pidCatalog'

const HTTP_GATEWAY_TIMEOUT = 504
const HTTP_NOT_FOUND = 404
const HTTP_UNPROCESSABLE_ENTITY = 422
const HTTP_PAYLOAD_TOO_LARGE = 413

/**
 * Presupuesto del hilo que se reenvia en cada pregunta (~60 KB serializados).
 *
 * El servidor acepta hasta 1 MB en esta ruta; el recorte es para que la
 * conversacion no crezca sin fin: cada pregunta reenvia todo lo anterior, asi
 * que sin tope el hilo acaba costando mas que la propia pregunta.
 */
export const MAX_HISTORY_BYTES = 60_000

/** Mensaje del 413: el hilo, no el sistema, es lo que hay que arreglar. */
const THREAD_TOO_LONG_MESSAGE =
  'La conversación es demasiado larga para continuar. Lanza un nuevo diagnóstico para empezar un hilo limpio.'

/** Kind of failure behind a cognitive diagnosis error, derived from the HTTP status. */
export type CognitiveDiagnosisErrorKind =
  'timeout' | 'unavailable' | 'too_many_steps' | 'thread_too_long' | 'unknown'

/**
 * Recorta el hilo que viaja al servidor, descartando los turnos mas antiguos
 * hasta caber en {@link MAX_HISTORY_BYTES}.
 *
 * Recorta solo lo que se **envia**: la conversacion que ve el mecanico en
 * pantalla se conserva entera. Y nunca devuelve vacio — con un unico turno que
 * ya excede el presupuesto, mas vale intentarlo y que el servidor decida.
 */
export function trimHistoryForRequest(
  history: readonly ConversationItem[],
): readonly ConversationItem[] {
  let start = 0
  while (
    start < history.length - 1 &&
    JSON.stringify(history.slice(start)).length > MAX_HISTORY_BYTES
  ) {
    start++
  }
  return start === 0 ? history : history.slice(start)
}

/**
 * Typed, user-facing error exposed by {@link useCognitiveDiagnosis}. The raw
 * exception is never relaunched to the caller — `kind` lets a consumer vary
 * icon/tone, `message` is already safe to render as-is.
 */
export interface CognitiveDiagnosisError {
  readonly message: string
  readonly kind: CognitiveDiagnosisErrorKind
}

/**
 * Maps a rejection from `api.getCognitiveDiagnosis` to a typed
 * {@link CognitiveDiagnosisError}. Centralized here so consumers
 * (`DiagnosisChat`, `PidsTable` via `DashboardPage`) never need to duplicate
 * `instanceof ApiHttpError` checks.
 */
export function deriveCognitiveDiagnosisError(error: unknown): CognitiveDiagnosisError {
  if (error instanceof ApiHttpError) {
    // El 413 llega con el mensaje crudo del servidor ("Request body is too
    // large"), que no le dice al mecanico ni que ha pasado ni que hacer.
    if (error.status === HTTP_PAYLOAD_TOO_LARGE) {
      return { message: THREAD_TOO_LONG_MESSAGE, kind: 'thread_too_long' }
    }
    const kind: CognitiveDiagnosisErrorKind =
      error.status === HTTP_GATEWAY_TIMEOUT
        ? 'timeout'
        : error.status === HTTP_NOT_FOUND
          ? 'unavailable'
          : error.status === HTTP_UNPROCESSABLE_ENTITY
            ? 'too_many_steps'
            : 'unknown'
    return { message: error.message, kind }
  }
  const message = error instanceof Error && error.message ? error.message : GENERIC_ERROR_MESSAGE
  return { message, kind: 'unknown' }
}

/**
 * Estado completo de una sesion de diagnostico cognitivo.
 *
 * Vive en un `useState` local y se resetea entero al cambiar de vehiculo
 * (`useEffect` sobre `selectedId`): al cambiar de coche desaparecen hilo,
 * sessionId y PIDs sin codigo de limpieza repartido por los consumidores.
 */
interface CognitiveState {
  readonly pidRows: PidRow[] | null
  readonly diagnosisText: string | null
  readonly severity: string | null
  readonly confidence: number | null
  readonly recommendations: string[] | null
  readonly conversationHistory: ConversationItem[]
  /** Id de la sesión persistida para encadenar follow-ups; null en sesión nueva. */
  readonly sessionId: number | null
  readonly error: CognitiveDiagnosisError | null
}

const EMPTY_HISTORY: ConversationItem[] = []

/**
 * Runs the LLM cognitive diagnosis for the selected scenario and exposes the
 * PIDs it discovered as table rows, plus the full response for chat display.
 *
 * Best-effort by design: the call can take up to 60 s and a failure never
 * throws to the caller — but it is not swallowed silently either: `error`
 * carries a typed, user-facing message so the deterministic diagnosis
 * already on screen keeps its own error semantics while the caller can still
 * surface the cognitive failure.
 */
export function useCognitiveDiagnosis(selectedId: string) {
  const [state, setState] = useState<CognitiveState | null>(null)
  const [loading, setLoading] = useState(false)

  // Ref al último estado: `trigger` lee historial y sessionId EN EL MOMENTO
  // de la llamada, no del closure del render, para que dos triggers seguidos
  // no pierdan el contexto del turno anterior.
  const stateRef = useRef<CognitiveState | null>(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Al cambiar de vehículo, todo el estado cognitivo del anterior desaparece.
  useEffect(() => {
    setState(null)
    setLoading(false)
  }, [selectedId])

  const trigger = async (query?: string) => {
    if (!selectedId) return
    const isFollowUp = query !== undefined
    const prev = stateRef.current

    // Un diagnóstico nuevo (sin query) no reenvía historial ni sessionId: el
    // backend abre una sesión nueva. Un follow-up conserva ambos.
    const history = isFollowUp ? (prev?.conversationHistory ?? EMPTY_HISTORY) : EMPTY_HISTORY
    const sessionId = isFollowUp ? (prev?.sessionId ?? null) : null

    if (prev) {
      if (isFollowUp) {
        if (prev.error) setState({ ...prev, error: null })
      } else {
        setState({ ...prev, conversationHistory: EMPTY_HISTORY, sessionId: null, error: null })
      }
    }

    setLoading(true)
    try {
      const historyToSend = trimHistoryForRequest(history)
      const output = await api.getCognitiveDiagnosis(
        selectedId,
        query,
        historyToSend.length > 0 ? [...historyToSend] : undefined,
        sessionId ?? undefined,
      )

      // Un diagnóstico nuevo solo aporta el primer turno del asistente;
      // un follow-up añade pregunta + respuesta.
      const turn: ConversationItem[] = query
        ? [
            { __type: 'user_message', content: query },
            { __type: 'raw_response', data: { text: output.diagnosis } },
          ]
        : [{ __type: 'raw_response', data: { text: output.diagnosis } }]

      setState({
        pidRows: output.pidObservations.map(pidObservationToRow),
        diagnosisText: output.diagnosis,
        severity: output.severity,
        confidence: output.confidence,
        recommendations: output.recommendations,
        sessionId: output.sessionId ?? null,
        conversationHistory: [...history, ...turn],
        error: null,
      })
    } catch (err) {
      const error = deriveCognitiveDiagnosisError(err)
      setState((s) => ({
        pidRows: s?.pidRows ?? null,
        diagnosisText: s?.diagnosisText ?? null,
        severity: s?.severity ?? null,
        confidence: s?.confidence ?? null,
        recommendations: s?.recommendations ?? null,
        sessionId: s?.sessionId ?? null,
        conversationHistory: s?.conversationHistory ?? EMPTY_HISTORY,
        error,
      }))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setState(null)
    setLoading(false)
  }

  return {
    pidRows: state?.pidRows ?? null,
    diagnosisText: state?.diagnosisText ?? null,
    severity: state?.severity ?? null,
    confidence: state?.confidence ?? null,
    recommendations: state?.recommendations ?? null,
    conversationHistory: state?.conversationHistory ?? EMPTY_HISTORY,
    sessionId: state?.sessionId ?? null,
    error: state?.error ?? null,
    loading,
    trigger,
    reset,
  }
}
