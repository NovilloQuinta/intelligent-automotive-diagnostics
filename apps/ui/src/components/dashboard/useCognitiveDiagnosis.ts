import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ConversationItem } from "@/lib/api";
import { ApiHttpError } from "@/lib/api-errors";
import { pidObservationToRow, type PidRow } from "./pidCatalog";

const COGNITIVE_QUERY_KEY = "cognitive-diagnosis";

/** Kind of failure behind a cognitive diagnosis error, derived from the HTTP status. */
export type CognitiveDiagnosisErrorKind =
  | "timeout"
  | "unavailable"
  | "too_many_steps"
  | "unknown";

/**
 * Typed, user-facing error exposed by {@link useCognitiveDiagnosis}. The raw
 * exception is never relaunched to the caller — `kind` lets a consumer vary
 * icon/tone, `message` is already safe to render as-is.
 */
export interface CognitiveDiagnosisError {
  readonly message: string;
  readonly kind: CognitiveDiagnosisErrorKind;
}

/**
 * Maps a rejection from `api.getCognitiveDiagnosis` to a typed
 * {@link CognitiveDiagnosisError}. Centralized here so consumers
 * (`MechanicChat`, `PidsTable` via `DashboardPage`) never need to duplicate
 * `instanceof ApiHttpError` checks.
 */
export function deriveCognitiveDiagnosisError(
  error: unknown,
): CognitiveDiagnosisError {
  if (error instanceof ApiHttpError) {
    const kind: CognitiveDiagnosisErrorKind =
      error.status === 504
        ? "timeout"
        : error.status === 404
          ? "unavailable"
          : error.status === 422
            ? "too_many_steps"
            : "unknown";
    return { message: error.message, kind };
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Ha ocurrido un problema. Si el problema persiste, contacta con soporte.";
  return { message, kind: "unknown" };
}

/**
 * Estado completo de una sesion de diagnostico cognitivo.
 *
 * Vive entero en la cache de Query bajo `[COGNITIVE_QUERY_KEY, selectedId]`,
 * incluido el hilo de conversacion: al cambiar de vehiculo la clave cambia y
 * todo desaparece sin codigo de limpieza. Un `useState` paralelo para el hilo
 * sobreviviria al cambio de coche y arrastraria la conversacion del anterior.
 */
interface CognitiveState {
  readonly pidRows: PidRow[];
  readonly diagnosisText: string | null;
  readonly severity: string | null;
  readonly confidence: number | null;
  readonly recommendations: string[] | null;
  readonly conversationHistory: ConversationItem[];
  readonly error: CognitiveDiagnosisError | null;
}

const EMPTY_HISTORY: ConversationItem[] = [];

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
  const queryClient = useQueryClient();
  const queryKey = [COGNITIVE_QUERY_KEY, selectedId] as const;

  const { data } = useQuery<CognitiveState>({
    queryKey,
    // La lectura nunca la dispara Query: solo el mecanico, al preguntar.
    queryFn: () => Promise.reject(new Error("not fetched directly")),
    enabled: false,
  });

  const mutation = useMutation({
    mutationFn: async (query?: string) => {
      // El historial se lee de la cache EN EL MOMENTO de la llamada, no del
      // closure del render: dos preguntas seguidas dentro del mismo render
      // verian el hilo anterior y la segunda perderia el contexto.
      const history =
        queryClient.getQueryData<CognitiveState>(queryKey)
          ?.conversationHistory ?? EMPTY_HISTORY;
      const output = await api.getCognitiveDiagnosis(
        selectedId,
        query,
        history.length > 0 ? history : undefined,
      );

      const next: CognitiveState = {
        pidRows: output.pidObservations.map(pidObservationToRow),
        diagnosisText: output.diagnosis,
        severity: output.severity,
        confidence: output.confidence,
        recommendations: output.recommendations,
        conversationHistory: [
          ...history,
          { __type: "user_message", content: query ?? "" },
          { __type: "raw_response", data: { text: output.diagnosis } },
        ],
        error: null,
      };
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (err) => {
      const error = deriveCognitiveDiagnosisError(err);
      queryClient.setQueryData<CognitiveState>(queryKey, (prev) => ({
        pidRows: prev?.pidRows ?? [],
        diagnosisText: prev?.diagnosisText ?? null,
        severity: prev?.severity ?? null,
        confidence: prev?.confidence ?? null,
        recommendations: prev?.recommendations ?? null,
        conversationHistory: prev?.conversationHistory ?? EMPTY_HISTORY,
        error,
      }));
    },
  });

  const trigger = async (query?: string) => {
    if (!selectedId) return;
    // Un intento nuevo limpia el error previo de inmediato, no al resolver:
    // si no, el aviso de la pregunta anterior seguiria visible mientras esta
    // esta en curso.
    queryClient.setQueryData<CognitiveState>(queryKey, (prev) =>
      prev && prev.error ? { ...prev, error: null } : prev,
    );
    try {
      return await mutation.mutateAsync(query);
    } catch {
      // No se relanza al llamador — onError ya dejo el estado actualizado.
    }
  };

  const reset = () => {
    mutation.reset();
    queryClient.removeQueries({ queryKey });
  };

  return {
    pidRows: data?.pidRows ?? null,
    diagnosisText: data?.diagnosisText ?? null,
    severity: data?.severity ?? null,
    confidence: data?.confidence ?? null,
    recommendations: data?.recommendations ?? null,
    conversationHistory: data?.conversationHistory ?? EMPTY_HISTORY,
    error: data?.error ?? null,
    loading: mutation.isPending,
    trigger,
    reset,
  };
}
