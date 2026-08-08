import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationItem } from "@/lib/api";

interface MechanicChatProps {
  readonly diagnosisText: string | null;
  readonly severity: string | null;
  readonly confidence: number | null;
  readonly conversationHistory: ConversationItem[];
  readonly loading: boolean;
  readonly onSend: (query: string) => void;
}

const SEVERITY_LABELS: Record<"low" | "medium" | "high" | "critical", string> =
  {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
  };

const SEVERITY_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  low: "default",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
};

export function MechanicChat({
  diagnosisText,
  severity,
  confidence,
  conversationHistory,
  loading,
  onSend,
}: MechanicChatProps) {
  const [query, setQuery] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setQuery("");
  }, [query, loading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSend();
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
        Chat con el Mecánico
      </h3>

      {conversationHistory.length > 0 && (
        <div className="flex max-h-80 min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {conversationHistory.map((item, i) => {
            if (item.__type === "user_message" && item.content) {
              return (
                <div
                  key={i}
                  className="self-end rounded-lg bg-primary/20 px-3 py-1.5 text-sm text-foreground/90 max-w-[80%]"
                >
                  {item.content}
                </div>
              );
            }
            if (item.__type === "raw_response" && item.data) {
              const data = item.data as { text?: string };
              if (data.text) {
                return (
                  <div
                    key={i}
                    className="self-start rounded-lg bg-white/5 px-3 py-1.5 text-sm text-foreground/80 max-w-[80%]"
                  >
                    {data.text}
                  </div>
                );
              }
            }
            return null;
          })}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {diagnosisText && !loading && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {severity && (
              <Badge
                variant={SEVERITY_VARIANTS[severity] ?? "default"}
                className="text-[10px] uppercase tracking-wider"
              >
                {SEVERITY_LABELS[severity] ?? severity}
              </Badge>
            )}
            {confidence !== null && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Confianza: {Math.round(confidence * 100)}%
              </span>
            )}
          </div>
          <p className="whitespace-pre-line text-sm text-foreground/80">
            {diagnosisText}
          </p>
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
        <Button
          onClick={handleSend}
          disabled={loading || !query.trim()}
          size="sm"
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}
