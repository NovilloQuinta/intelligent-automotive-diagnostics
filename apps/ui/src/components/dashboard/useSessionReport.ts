import { useEffect, useRef, useState } from 'react'
import { api, type CognitiveOutput } from '@/lib/api'
import { ApiHttpError } from '@/lib/api-errors'
import { extractErrorMessage } from '@/lib/errors'
import type { DiagnosisResponse, EcuInfo, FreezeFrame } from './types'

const HTTP_NOT_FOUND = 404

const COGNITIVE_UNAVAILABLE = 'unavailable' as const
type CognitiveSentinel = typeof COGNITIVE_UNAVAILABLE

export interface SessionReportState {
  readonly capabilities: { cognitiveDiagnosis: boolean } | null
  readonly deterministic: DiagnosisResponse | null
  readonly deterministicLoading: boolean
  readonly deterministicError: string | null
  readonly ecus: EcuInfo[] | null
  readonly ecusLoading: boolean
  readonly freezeFrame: FreezeFrame | null
  readonly freezeFrameLoading: boolean
  readonly cognitive: CognitiveOutput | CognitiveSentinel | null
  readonly cognitiveLoading: boolean
  readonly cognitiveError: string | null
}

const INITIAL_STATE: SessionReportState = {
  capabilities: null,
  deterministic: null,
  deterministicLoading: false,
  deterministicError: null,
  ecus: null,
  ecusLoading: false,
  freezeFrame: null,
  freezeFrameLoading: false,
  cognitive: null,
  cognitiveLoading: false,
  cognitiveError: null,
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === HTTP_NOT_FOUND
}

/**
 * Diagnóstico cognitivo ya calculado por `useCognitiveDiagnosis` en el dashboard.
 *
 * El informe lo reusa en vez de volver a pedirlo: `getCognitiveDiagnosis` tarda
 * hasta 60s y gasta tokens reales, así que repetirlo cada vez que el mecánico
 * abre esta pestaña —aunque ya se hubiera lanzado antes— es tiempo y dinero
 * tirados, además de comerse la cuota del rate limit para nada.
 */
export interface PrecomputedCognitive {
  readonly diagnosisText: string | null
  readonly severity: string | null
  readonly confidence: number | null
  readonly recommendations: string[] | null
  readonly loading: boolean
  readonly error: { message: string } | null
}

function cognitiveStateFromPrecomputed(
  precomputed: PrecomputedCognitive,
): Pick<SessionReportState, 'cognitive' | 'cognitiveLoading' | 'cognitiveError'> {
  if (precomputed.error) {
    return { cognitive: null, cognitiveLoading: false, cognitiveError: precomputed.error.message }
  }
  if (precomputed.diagnosisText === null) {
    return { cognitive: null, cognitiveLoading: precomputed.loading, cognitiveError: null }
  }
  return {
    cognitive: {
      diagnosis: precomputed.diagnosisText,
      severity: precomputed.severity ?? 'low',
      confidence: precomputed.confidence ?? 0,
      recommendations: precomputed.recommendations ?? [],
      toolCalls: [],
      pidObservations: [],
    },
    cognitiveLoading: precomputed.loading,
    cognitiveError: null,
  }
}

/**
 * Runs a single fetch section inside the lifecycle of the report effect.
 * Handles the common `.then(guard).catch(guard).finally(guard)` pattern
 * that was repeated 4 times verbatim.
 */
type SetState = React.Dispatch<React.SetStateAction<SessionReportState>>

/** `setState` + guarda de cancelación compartidos por todas las secciones del reporte. */
interface SectionContext {
  readonly setState: SetState
  readonly cancelled: { current: boolean }
}

interface RunSectionOptions<T> {
  readonly fetchFn: () => Promise<T>
  readonly onData: (data: T) => Partial<SessionReportState>
  readonly onError: (e: unknown) => Partial<SessionReportState>
  readonly onFinally: () => Partial<SessionReportState>
}

function runSection<T>(options: RunSectionOptions<T>, ctx: SectionContext): void {
  const { fetchFn, onData, onError, onFinally } = options
  const { setState, cancelled } = ctx

  fetchFn()
    .then((data) => {
      if (cancelled.current) return
      setState((prev) => ({ ...prev, ...onData(data) }))
    })
    .catch((e: unknown) => {
      if (cancelled.current) return
      setState((prev) => ({ ...prev, ...onError(e) }))
    })
    .finally(() => {
      if (!cancelled.current) setState((prev) => ({ ...prev, ...onFinally() }))
    })
}

// Section loaders (extracted from the large useEffect body)

function loadCapabilitiesAndCognitive(scenarioId: string, ctx: SectionContext): void {
  const { setState, cancelled } = ctx

  api.getCapabilities().then((caps) => {
    if (cancelled.current) return
    setState((prev) => ({ ...prev, capabilities: caps }))

    if (caps.cognitiveDiagnosis) {
      runSection(
        {
          fetchFn: () => api.getCognitiveDiagnosis(scenarioId),
          onData: (data) => ({ cognitive: data }),
          onError: (e) => ({
            cognitive: null,
            cognitiveError: extractErrorMessage(e, 'Error en diagnóstico cognitivo'),
          }),
          onFinally: () => ({ cognitiveLoading: false }),
        },
        ctx,
      )
    } else {
      setState((prev) => ({
        ...prev,
        cognitive: COGNITIVE_UNAVAILABLE,
        cognitiveLoading: false,
      }))
    }
  })
}

function loadDeterministic(scenarioId: string, ctx: SectionContext): void {
  runSection(
    {
      fetchFn: () => api.runDiagnosis(scenarioId),
      onData: (data) => ({ deterministic: data }),
      onError: (e) => ({
        deterministic: null,
        deterministicError: extractErrorMessage(e, 'Error en diagnóstico'),
      }),
      onFinally: () => ({ deterministicLoading: false }),
    },
    ctx,
  )
}

function loadEcuInfo(scenarioId: string, ctx: SectionContext): void {
  runSection(
    {
      fetchFn: () => api.getEcuInfo(scenarioId),
      onData: (data) => ({ ecus: data }),
      onError: (e) => (isNotFoundError(e) ? { ecus: null } : {}),
      onFinally: () => ({ ecusLoading: false }),
    },
    ctx,
  )
}

function loadFreezeFrame(
  scenarioId: string,
  dtcCode: string | undefined,
  ctx: SectionContext,
): void {
  runSection(
    {
      fetchFn: () => api.getFreezeFrame(scenarioId, dtcCode),
      onData: (data) => ({ freezeFrame: data }),
      onError: (e) => (isNotFoundError(e) ? { freezeFrame: null } : {}),
      onFinally: () => ({ freezeFrameLoading: false }),
    },
    ctx,
  )
}

/**
 * Orchestrates the parallel fetching of all sections that compose a diagnosis
 * session report for the given scenario:
 *
 * 1. Probes MCP capabilities to decide whether cognitive diagnosis is available.
 * 2. Fires deterministic diagnosis, ECU info, and freeze frame in parallel.
 * 3. If cognitive is available, fires the cognitive diagnosis call (which may
 *    take up to 60 s).
 *
 * 404 responses from ECU-info / freeze-frame silently set the corresponding
 * section to `null` — they are expected when a scenario has no ECUs or no
 * freeze-frame snapshot.
 */
export function useSessionReport(
  scenarioId: string,
  precomputedCognitive?: PrecomputedCognitive,
  dtcCode?: string,
): SessionReportState {
  const [state, setState] = useState<SessionReportState>(INITIAL_STATE)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!scenarioId) return

    cancelled.current = false

    setState({
      ...INITIAL_STATE,
      deterministicLoading: true,
      ecusLoading: true,
      freezeFrameLoading: true,
      cognitiveLoading: !precomputedCognitive || precomputedCognitive.loading,
    })

    const ctx: SectionContext = { setState, cancelled }
    if (precomputedCognitive) {
      setState((prev) => ({
        ...prev,
        capabilities: { cognitiveDiagnosis: true },
        ...cognitiveStateFromPrecomputed(precomputedCognitive),
      }))
    } else {
      loadCapabilitiesAndCognitive(scenarioId, ctx)
    }
    loadDeterministic(scenarioId, ctx)
    loadEcuInfo(scenarioId, ctx)
    loadFreezeFrame(scenarioId, dtcCode, ctx)

    return () => {
      cancelled.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- precomputedCognitive/dtcCode se releen via closure a proposito: solo scenarioId debe reiniciar el efecto entero.
  }, [scenarioId])

  // Mantiene la seccion cognitiva sincronizada con el hook de arriba sin relanzar el resto del informe.
  useEffect(() => {
    if (!precomputedCognitive) return
    setState((prev) => ({ ...prev, ...cognitiveStateFromPrecomputed(precomputedCognitive) }))
  }, [precomputedCognitive])

  return state
}
