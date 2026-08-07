import { useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useScenarios } from "./useScenarios";
import { useLiveTelemetry } from "./useLiveTelemetry";
import { useDiagnosis } from "./useDiagnosis";
import { useEcuInfo } from "./useEcuInfo";
import { TopBar } from "./TopBar";
import { TelemetrySection } from "./TelemetrySection";
import { DtcPanel } from "./DtcPanel";
import { FreezeFramePanel } from "./FreezeFramePanel";
import { EcuInfoPanel } from "./EcuInfoPanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { PidsTable } from "./PidsTable";
import { SessionReportPanel } from "./SessionReportPanel";

/** Main OBD-II dashboard page: telemetry gauges, vehicle selection, DTC panel, and AI diagnosis. */
export function DashboardPage() {
  const auth = useAuth();

  // All hooks must be called unconditionally (React rules-of-hooks)
  const { scenarios, selectedId, setSelectedId, scenariosError } =
    useScenarios();
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null;
  const { live, streamOk } = useLiveTelemetry(selectedScenario);
  const { loading, result, runDiagnosis } = useDiagnosis(selectedId);
  const { ecus, loading: ecusLoading, error: ecusError } = useEcuInfo(selectedId);
  const [selectedDtc, setSelectedDtc] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

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
        onReportClick={() => setShowReport((v) => !v)}
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
          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:gap-6">
            <DtcPanel
              codes={result?.dtcCodes ?? null}
              severity={result?.severity ?? null}
              empty={!result && !loading}
              selectedCode={selectedDtc}
              onSelect={setSelectedDtc}
            />
            <FreezeFramePanel scenarioId={selectedId} dtc={selectedDtc} />
            <EcuInfoPanel
              ecus={ecus}
              loading={ecusLoading}
              error={ecusError}
              selectedId={selectedId}
            />
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
      {showReport && selectedId && (
        <section className="border-t border-white/5 bg-black/40 px-4 py-6 md:px-6">
          {/*
           * KISS: useSessionReport re-fetches getEcuInfo/getFreezeFrame even
           * though the lateral panels already loaded them. Sharing their state
           * would couple the dashboard grid with the report panel, adding
           * complexity. The double fetch is harmless (the calls are cached by
           * the browser's HTTP layer for a few seconds) and keeps each
           * component self-contained.
           */}
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold uppercase tracking-wider text-foreground/90">
                Informe de Sesión de Diagnóstico
              </h2>
              <button
                onClick={() => setShowReport(false)}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Cerrar informe ✕
              </button>
            </div>
            <SessionReportPanel
              scenarioId={selectedId}
              vehicleInfo={selectedScenario?.vehicleInfo}
            />
          </div>
        </section>
      )}
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
