import { TelemetrySection } from "./TelemetrySection";
import { PidsTable } from "./PidsTable";
import { DtcPanel } from "./DtcPanel";
import { FreezeFramePanel } from "./FreezeFramePanel";
import { EcuInfoPanel } from "./EcuInfoPanel";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { MechanicChat } from "./MechanicChat";
import { SessionReportPanel } from "./SessionReportPanel";
import { VehicleStatusPanel } from "./VehicleStatusPanel";
import type { SidebarSection } from "@/components/layout/Sidebar";
import type { CognitiveDiagnosisError } from "./useCognitiveDiagnosis";
import type { EcuInfo } from "./types";
import type { PidRow } from "./pidCatalog";
import type { ConversationItem } from "@/lib/api";
import type {
  DiagnosisResponse,
  ScenarioDescriptor,
} from "./types";

export interface DashboardSectionProps {
  readonly activeSection: SidebarSection;
  readonly selectedId: string | null;
  readonly selectedScenario: ScenarioDescriptor | null;
  readonly rpm: number | null;
  readonly coolant: number | null;
  readonly speed: number | null;
  readonly intake: number | null;
  readonly rawSummary: string | null;
  readonly loading: boolean;
  readonly streamOk: boolean;
  readonly result: DiagnosisResponse | null | undefined;
  readonly dtcCodes: readonly { code: string; description?: string }[] | null;
  readonly selectedDtc: string | null;
  readonly cognitiveDiagnosisText: string | null;
  readonly cognitiveSeverity: string | null;
  readonly cognitiveConfidence: number | null;
  readonly cognitiveConversationHistory: ConversationItem[];
  readonly cognitiveLoading: boolean;
  readonly cognitiveError: CognitiveDiagnosisError | null;
  readonly cognitivePidRows: PidRow[];
  readonly cognitiveAvailable: boolean;
  readonly ecus: EcuInfo[] | null;
  readonly ecusLoading: boolean;
  readonly ecusError: string | null;
  readonly onDiagnose: () => void;
  readonly onDtcSelect: (code: string) => void;
  readonly onChatSend: (query: string) => void;
}

export function DashboardSection({
  activeSection,
  selectedId,
  selectedScenario,
  rpm,
  coolant,
  speed,
  intake,
  rawSummary,
  loading,
  streamOk,
  result,
  dtcCodes,
  selectedDtc,
  cognitiveDiagnosisText,
  cognitiveSeverity,
  cognitiveConfidence,
  cognitiveConversationHistory,
  cognitiveLoading,
  cognitiveError,
  cognitivePidRows,
  cognitiveAvailable,
  ecus,
  ecusLoading,
  ecusError,
  onDiagnose,
  onDtcSelect,
  onChatSend,
}: DashboardSectionProps) {
  switch (activeSection) {
    case "vehicle":
      return <VehicleStatusPanel scenarioId={selectedId ?? ""} />;
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
            onDiagnose={onDiagnose}
          />
          <PidsTable
            parsedValues={result?.parsedValues ?? null}
            empty={!result && !loading}
            aiRows={cognitivePidRows}
            aiLoading={cognitiveLoading}
            aiError={cognitiveError}
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
          onSelect={onDtcSelect}
          scenarioId={selectedId || ""}
        />
      );
    case "freeze-frame":
      return <FreezeFramePanel scenarioId={selectedId} dtc={selectedDtc} />;
    case "ecu":
      return (
        <EcuInfoPanel
          ecus={ecus ?? []}
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
      if (!cognitiveAvailable) {
        return (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            El diagnóstico cognitivo no está disponible en este entorno.
          </div>
        );
      }
      return (
        <MechanicChat
          diagnosisText={cognitiveDiagnosisText}
          severity={cognitiveSeverity}
          confidence={cognitiveConfidence}
          conversationHistory={cognitiveConversationHistory}
          loading={cognitiveLoading}
          error={cognitiveError}
          onSend={onChatSend}
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
}
