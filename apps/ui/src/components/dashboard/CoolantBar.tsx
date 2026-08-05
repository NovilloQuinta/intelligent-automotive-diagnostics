import { AlertTriangle, Thermometer } from "lucide-react";
import { useAnimatedNumber } from "./useAnimatedNumber";
import { COOLANT_TICK_POSITIONS, GAUGE, GRADIENTS } from "./types";
import { clampPct } from "@/lib/utils";

/** Vertical thermometer bar showing coolant temperature with alarm threshold. */
export function CoolantBar({
  value,
  loading,
}: {
  value: number | null;
  loading: boolean;
}) {
  const display = useAnimatedNumber(value);
  const v = value ?? 0;
  const alarm = v > GAUGE.COOLANT_ALARM;
  const pct = clampPct(display / GAUGE.COOLANT_MAX);

  return (
    <div
      className="panel relative flex flex-col p-4"
      title="Temperatura del refrigerante. Rango normal: 85–95°C. Alarma > 100°C."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Thermometer className="h-3.5 w-3.5 text-primary" />
          Refrigerante
        </div>
        <span className="mono text-[10px] text-muted-foreground">°C</span>
      </div>

      <div className="mt-3 flex flex-1 items-center gap-4">
        <div className="relative h-40 w-6 overflow-hidden rounded-full border border-white/10 bg-black/40">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300"
            style={{
              height: `${pct * 100}%`,
              background: GRADIENTS.coolant,
              boxShadow: alarm
                ? GRADIENTS.coolantAlarmGlow
                : GRADIENTS.coolantGlow,
            }}
          />
          {COOLANT_TICK_POSITIONS.map((t) => (
            <div
              key={t}
              className="absolute right-0 h-px w-2 bg-white/20"
              style={{ bottom: `${t}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col">
          <span
            className={`mono text-4xl font-bold leading-none ${alarm ? "text-destructive" : "text-foreground"}`}
          >
            {loading ? "--" : Math.round(display)}
          </span>
          <span className="mono mt-1 text-xs text-muted-foreground">°C</span>
          {alarm && (
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
              <AlertTriangle className="h-3 w-3" /> Alarma
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
