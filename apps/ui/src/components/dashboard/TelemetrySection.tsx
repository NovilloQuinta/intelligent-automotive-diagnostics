import { Activity } from "lucide-react";
import { RpmGauge } from "./RpmGauge";
import { CoolantBar } from "./CoolantBar";
import { SpeedDisplay } from "./SpeedDisplay";
import { IntakeThermo } from "./IntakeThermo";
import { DiagnoseButton } from "./DiagnoseButton";
import { COLORS } from "./types";

type TelemetryValues = {
  rpm: number | null;
  coolant: number | null;
  speed: number | null;
  intake: number | null;
};

type Props = {
  values: TelemetryValues;
  rawSummary: string | null;
  loading: boolean;
  streamOk: boolean;
  canDiagnose: boolean;
  telemetryStatus: string;
  onDiagnose: () => void;
};

function LiveBadge({
  streamOk,
  loading,
}: {
  streamOk: boolean;
  loading: boolean;
}) {
  if (!streamOk || loading) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-2 py-0.5">
      <span
        className="led-dot h-1.5 w-1.5 rounded-full"
        style={{ background: COLORS.accent }}
      />
      <span
        className="mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: COLORS.accent }}
      >
        En Vivo
      </span>
    </span>
  );
}

/** Left panel: live telemetry gauges + diagnose button with streaming status. */
export function TelemetrySection({
  values,
  rawSummary,
  loading,
  streamOk,
  canDiagnose,
  telemetryStatus,
  onDiagnose,
}: Props) {
  const { rpm, coolant, speed, intake } = values;
  return (
    <section
      className={`panel relative flex flex-col self-start overflow-hidden p-4 md:p-5 ${loading ? "scanning" : ""}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em]">
            Telemetría en vivo
          </h2>
          <LiveBadge streamOk={streamOk} loading={loading} />
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {telemetryStatus}
        </div>
      </div>
      <div
        className={`relative grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "scan-sweep" : ""}`}
      >
        <RpmGauge value={rpm} loading={loading && rpm == null} />
        <CoolantBar value={coolant} loading={loading && coolant == null} />
        <SpeedDisplay value={speed} loading={loading && speed == null} />
        <IntakeThermo value={intake} loading={loading && intake == null} />
      </div>
      <DiagnoseButton
        loading={loading}
        disabled={!canDiagnose}
        onClick={onDiagnose}
        rawSummary={rawSummary}
      />
    </section>
  );
}
