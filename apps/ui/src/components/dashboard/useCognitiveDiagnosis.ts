import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ConversationItem } from "@/lib/api";
import { pidObservationToRow, type PidRow } from "./pidCatalog";

const COGNITIVE_QUERY_KEY = "cognitive-diagnosis";

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
}

const EMPTY_HISTORY: ConversationItem[] = [];

/**
 * Runs the LLM cognitive diagnosis for the selected scenario and exposes the
 * PIDs it discovered as table rows, plus the full response for chat display.
 *
 * Best-effort by design: the call can take up to 60 s and any failure is
 * swallowed (no toast) so the deterministic diagnosis already on screen keeps
 * its own error semantics.
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
      };
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: () => {
      // swallowed by design
    },
  });

  const trigger = async (query?: string) => {
    if (!selectedId) return;
    try {
      return await mutation.mutateAsync(query);
    } catch {
      // swallowed by design — onError already handled it
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
    loading: mutation.isPending,
    trigger,
    reset,
  };
}
