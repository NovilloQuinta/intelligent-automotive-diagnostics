import { useCallback, useState } from "react";
import { api, type ConversationItem } from "@/lib/api";
import { pidObservationToRow, type PidRow } from "./pidCatalog";

/**
 * Runs the LLM cognitive diagnosis for the selected scenario and exposes the
 * PIDs it discovered as table rows, plus the full response for chat display.
 *
 * Best-effort by design: the call can take up to 60 s and any failure is
 * swallowed (no toast) so the deterministic diagnosis already on screen keeps
 * its own error semantics.
 */
export function useCognitiveDiagnosis(selectedId: string) {
  const [loading, setLoading] = useState(false);
  const [pidRows, setPidRows] = useState<PidRow[] | null>(null);
  const [diagnosisText, setDiagnosisText] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<string[] | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationItem[]
  >([]);

  const trigger = useCallback(
    async (query?: string) => {
      if (!selectedId) return;
      setLoading(true);
      setPidRows(null);
      try {
        const output = await api.getCognitiveDiagnosis(
          selectedId,
          query,
          conversationHistory.length > 0 ? conversationHistory : undefined,
        );
        setPidRows(output.pidObservations.map(pidObservationToRow));
        setDiagnosisText(output.diagnosis);
        setSeverity(output.severity);
        setConfidence(output.confidence);
        setRecommendations(output.recommendations);
        setConversationHistory((prev) => [
          ...prev,
          { __type: "user_message", content: query ?? "" },
          { __type: "raw_response", data: { text: output.diagnosis } },
        ]);
      } catch {
        setPidRows(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedId, conversationHistory],
  );

  const reset = useCallback(() => {
    setPidRows(null);
    setDiagnosisText(null);
    setSeverity(null);
    setConfidence(null);
    setRecommendations(null);
    setConversationHistory([]);
    setLoading(false);
  }, []);

  return {
    pidRows,
    diagnosisText,
    severity,
    confidence,
    recommendations,
    conversationHistory,
    loading,
    trigger,
    reset,
  };
}
