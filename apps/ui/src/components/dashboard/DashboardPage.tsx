import { useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useScenarios } from "./useScenarios";
import { useLiveTelemetry } from "./useLiveTelemetry";
import { useDiagnosis } from "./useDiagnosis";
import { TopBar } from "./TopBar";
import { TelemetrySection } from "./TelemetrySection";
import { DtcPanel } from "./DtcPanel";
import { FreezeFramePanel } from "./FreezeFramePanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { PidsTable } from "./PidsTable";

/** Main OBD-II dashboard page: telemetry gauges, vehicle selection, DTC panel, and AI diagnosis. */
export function DashboardPage() {
  const auth = useAuth();

  // All hooks must be called unconditionally (React rules-of-hooks)
  const { scenarios, selectedId, setSelectedId, scenariosError } =
    useScenarios();
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null;
  const { live, streamOk } = useLiveTelemetry(selectedScenario);
  const { loading, result, runDiagnosis } = useDiagnosis(selectedId);
  const [selectedDtc, setSelectedDtc] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDtc(null);
  }, [selectedId]);

  if (auth.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  const rpm = live?.rpm ?? result?.parsedValues.rpm ?? null;
  const coolant = live?.coolantTemp ?? result?.parsedValues.coolantTemp ?? null;
  const speed = live?.speed ?? result?.parsedValues.speed ?? null;
  const intake = live?.intakeTemp ?? result?.parsedValues.intakeTemp ?? null;
  const rawSummary = live?.rawData ?? result?.rawData ?? null;

  const telemetryStatus = loading
    ? "Diagnosticando…"
    : streamOk
      ? "Streaming ECU · 2 Hz"
      : selectedId
        ? "Conectando…"
        : "Sin vehículo";

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <TopBar
        scenarios={scenarios}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
        onLogout={() => auth.logout()}
      />
      {scenariosError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {scenariosError}
        </div>
      )}
      <main className="flex-1 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
          <TelemetrySection
            values={{ rpm, coolant, speed, intake }}
            rawSummary={rawSummary}
            loading={loading}
            streamOk={streamOk}
            canDiagnose={!!selectedId}
            telemetryStatus={telemetryStatus}
            onDiagnose={runDiagnosis}
          />
          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:gap-6">
            <DtcPanel
              codes={result?.dtcCodes ?? null}
              severity={result?.severity ?? null}
              empty={!result && !loading}
              selectedCode={selectedDtc}
              onSelect={setSelectedDtc}
            />
            <FreezeFramePanel scenarioId={selectedId} dtc={selectedDtc} />
            <DiagnosisPanel
              text={result?.diagnosisText ?? null}
              severity={result?.severity ?? null}
              empty={!result && !loading}
              loading={loading}
            />
            <PidsTable
              parsedValues={result?.parsedValues ?? null}
              empty={!result && !loading}
            />
          </section>
        </div>
      </main>
      <footer className="relative z-10 border-t border-white/5 bg-black/40 px-6 py-2">
        <div className="mono flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Intelligent Automotive Diagnostics</span>
          <span className="flex items-center gap-3">
            <span>Protocolo: ISO 15765-4 CAN</span>
            <span>Build v1.0.0</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
