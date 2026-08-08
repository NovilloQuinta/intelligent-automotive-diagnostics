import { useCallback, useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useScenarios } from "./useScenarios";
import { useVehicleAutoDetect } from "./useVehicleAutoDetect";
import { VehicleAutoDetectWizard } from "./VehicleAutoDetectWizard";
import { useLiveTelemetry } from "./useLiveTelemetry";
import { useDiagnosis } from "./useDiagnosis";
import { useCapabilities } from "./useCapabilities";
import { useCognitiveDiagnosis } from "./useCognitiveDiagnosis";
import { useEcuInfo } from "./useEcuInfo";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TelemetrySection } from "./TelemetrySection";
import { DtcPanel } from "./DtcPanel";
import { FreezeFramePanel } from "./FreezeFramePanel";
import { EcuInfoPanel } from "./EcuInfoPanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { PidsTable } from "./PidsTable";
import { VehicleStatusPanel } from "./VehicleStatusPanel";
import { MechanicChat } from "./MechanicChat";
import { SessionReportPanel } from "./SessionReportPanel";
import type { SidebarSection } from "@/components/layout/Sidebar";

export function DashboardPage() {
  const auth = useAuth();

  const { scenarios, selectedId, setSelectedId, scenariosError } =
    useScenarios();
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null;
  const { live, streamOk } = useLiveTelemetry(selectedId);
  const { loading, result, runDiagnosis } = useDiagnosis(selectedId);
  const { cognitiveDiagnosis } = useCapabilities();
  const cognitive = useCognitiveDiagnosis(selectedId);
  const {
    ecus,
    loading: ecusLoading,
    error: ecusError,
  } = useEcuInfo(selectedId);
  const [selectedDtc, setSelectedDtc] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<SidebarSection>("live-data");
  const wizard = useVehicleAutoDetect();

  useEffect(() => {
    setSelectedDtc(null);
  }, [selectedId]);

  /** Al seleccionar vehiculo se dispara el diagnostico automaticamente. */
  useEffect(() => {
    if (!selectedId) return;
    cognitive.reset();
    void (async () => {
      await runDiagnosis();
      if (cognitiveDiagnosis) void cognitive.trigger();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /**
   * El diagnóstico cognitivo se dispara tras el determinista y sin `await`: la
   * respuesta LLM puede tardar hasta 60 s y no debe retrasar la pintura de
   * severidad, DTCs ni de los 4 PIDs fijos.
   */
  const handleDiagnose = useCallback(async () => {
    cognitive.reset();
    await runDiagnosis();
    if (cognitiveDiagnosis) void cognitive.trigger();
  }, [runDiagnosis, cognitiveDiagnosis, cognitive.reset, cognitive.trigger]);

  const handleChatSend = useCallback(
    (q: string) => {
      void cognitive.trigger(q);
    },
    [cognitive.trigger],
  );

  const handleVehicleConfirmed = useCallback(
    (scenarioId: string) => {
      setSelectedId(scenarioId);
      wizard.confirm();
    },
    [setSelectedId, wizard.confirm],
  );

  const handleDtcSelect = useCallback((code: string) => {
    setSelectedDtc(code);
    setActiveSection("freeze-frame");
  }, []);

  if (auth.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  const rpm = live?.rpm ?? result?.parsedValues.rpm ?? null;
  const coolant = live?.coolantTemp ?? result?.parsedValues.coolantTemp ?? null;
  const speed = live?.speed ?? result?.parsedValues.speed ?? null;
  const intake = live?.intakeTemp ?? result?.parsedValues.intakeTemp ?? null;
  const rawSummary = live?.rawData ?? result?.rawData ?? null;

  const vehicleReady = wizard.step === "done";
  const dtcCodes = result?.dtcCodes ?? null;
  const hasDiagnosis = result !== null;
  const dtcCount = dtcCodes?.length ?? 0;

  if (!vehicleReady) {
    return (
      <DashboardLayout
        activeSection="vehicle"
        onSectionChange={() => {}}
        scenarios={scenarios}
        selectedId={selectedId}
        onSelectVehicle={wizard.detect}
        loading={loading}
        streamOk={false}
        onLogout={() => auth.logout()}
      >
        {scenariosError && (
          <div className="mb-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
            {scenariosError}
          </div>
        )}
        <VehicleAutoDetectWizard
          scenarios={scenarios}
          step={wizard.step}
          scenarioId={wizard.scenarioId}
          vehicle={wizard.vehicle}
          error={wizard.error}
          onSelect={wizard.detect}
          onRetry={wizard.retry}
          onBack={wizard.restart}
          onConfirm={handleVehicleConfirmed}
        />
      </DashboardLayout>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case "vehicle":
        return <VehicleStatusPanel scenarioId={selectedId} />;
      case "live-data":
        return (
          <div className="space-y-6">
            <TelemetrySection
              values={{ rpm, coolant, speed, intake }}
              rawSummary={rawSummary}
              loading={loading}
              streamOk={streamOk}
              canDiagnose={!!selectedId}
              telemetryStatus={
                streamOk ? "Transmisión ECU · 1 Hz" : "Reconectando…"
              }
              onDiagnose={handleDiagnose}
            />
            <PidsTable
              parsedValues={result?.parsedValues ?? null}
              empty={!result && !loading}
              aiRows={cognitive.pidRows}
              aiLoading={cognitive.loading}
            />
          </div>
        );
      case "dtc":
        return (
          <DtcPanel
            codes={dtcCodes}
            severity={result?.severity ?? null}
            empty={!result && !loading}
            selectedCode={selectedDtc}
            onSelect={handleDtcSelect}
            scenarioId={selectedId || ""}
          />
        );
      case "freeze-frame":
        return (
          <FreezeFramePanel scenarioId={selectedId} dtc={selectedDtc} />
        );
      case "ecu":
        return (
          <EcuInfoPanel
            ecus={ecus}
            loading={ecusLoading}
            error={ecusError}
            selectedId={selectedId}
          />
        );
      case "diagnosis":
        return (
          <DiagnosisPanel
            text={result?.diagnosisText ?? null}
            severity={result?.severity ?? null}
            empty={!result && !loading}
            loading={loading}
          />
        );
      case "chat":
        if (!cognitiveDiagnosis) {
          return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              El diagnóstico cognitivo no está disponible en este entorno.
            </div>
          );
        }
        return (
          <MechanicChat
            diagnosisText={cognitive.diagnosisText}
            severity={cognitive.severity}
            confidence={cognitive.confidence}
            conversationHistory={cognitive.conversationHistory}
            loading={cognitive.loading}
            onSend={handleChatSend}
          />
        );
      case "report":
        return (
          <div>
            <h2 className="mb-4 text-lg font-bold uppercase tracking-wider text-foreground/90">
              Informe de Sesión de Diagnóstico
            </h2>
            <SessionReportPanel
              scenarioId={selectedId}
              vehicleInfo={selectedScenario?.vehicleInfo}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      dtcCount={dtcCount}
      hasDiagnosis={hasDiagnosis}
      scenarios={scenarios}
      selectedId={selectedId}
      onSelectVehicle={wizard.detect}
      loading={loading}
      streamOk={streamOk}
      onLogout={() => auth.logout()}
    >
      {scenariosError && (
        <div className="mb-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {scenariosError}
        </div>
      )}
      {renderSection()}
    </DashboardLayout>
  );
}
