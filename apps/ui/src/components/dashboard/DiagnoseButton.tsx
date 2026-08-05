import { Loader2, ScanLine } from "lucide-react";
import { BUTTON_COLORS, COLORS, SVG_STROKES } from "./types";

type Props = {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  rawSummary: string | null;
};

/** CTA button with loading state and raw OBD frame readout. */
export function DiagnoseButton({
  loading,
  disabled,
  onClick,
  rawSummary,
}: Props) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <button
        onClick={onClick}
        disabled={loading || disabled}
        className="group inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-bold uppercase tracking-[0.15em] transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: loading ? BUTTON_COLORS.loadingBg : BUTTON_COLORS.idleBg,
          color: loading ? COLORS.primary : COLORS.background,
          boxShadow: loading ? "none" : SVG_STROKES.primaryGlow,
        }}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Diagnosticando…
          </>
        ) : (
          <>
            <ScanLine className="h-4 w-4" />
            Iniciar diagnóstico
          </>
        )}
      </button>
      <div className="mono flex-1 truncate rounded-md border border-white/5 bg-black/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="text-primary">RAW ›</span>{" "}
        {rawSummary ?? "Aguardando trama OBD-II…"}
      </div>
    </div>
  );
}
