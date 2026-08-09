import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Loader2,
  XCircle,
} from "lucide-react";
import { useVehicleStatus } from "./useVehicleStatus";
import type { MonitorStatus } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  readonly scenarioId: string | null;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptySelection() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo para ver su estado</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Cargando estado…</span>
    </div>
  );
}

function ErrorState({ message }: { readonly message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-destructive">
      <span>{message}</span>
    </div>
  );
}

/** Renderiza una fila de un monitor de emisiones. */
function MonitorRow({ monitor }: { readonly monitor: MonitorStatus }) {
  if (!monitor.supported) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
        <XCircle className="h-3.5 w-3.5" />
        <span className="capitalize">{monitor.name}</span>
        <span className="ml-auto text-[10px]">No soportado</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-foreground/80">
      {monitor.completed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
      )}
      <span className="capitalize">{monitor.name}</span>
      <span
        className={`ml-auto text-[10px] ${monitor.completed ? "text-success font-medium" : "text-muted-foreground"}`}
      >
        {monitor.completed ? "Completado" : "Pendiente"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VehicleStatusPanel({ scenarioId }: Props) {
  const { status, loading, error } = useVehicleStatus(scenarioId);

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">
            Estado del vehículo
          </h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {scenarioId ?? "—"}
        </span>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {!scenarioId && <EmptySelection />}
        {scenarioId && loading && <LoadingState />}
        {scenarioId && !loading && error && <ErrorState message={error} />}
        {scenarioId && !loading && !error && status && (
          <>
            {/* MIL Indicator */}
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                status.milOn
                  ? "bg-destructive/10 text-destructive"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {status.milOn ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              <span>Testigo MIL: {status.milOn ? "Encendido" : "Apagado"}</span>
            </div>

            {/* DTC Count */}
            <div className="flex items-center gap-2 text-sm text-foreground/80">
              <span className="text-base font-bold tabular-nums text-primary">
                {status.dtcCount}
              </span>
              <span>
                {status.dtcCount === 1
                  ? "avería almacenada"
                  : "averías almacenadas"}
              </span>
            </div>

            {/* Engine Type */}
            <div className="text-xs text-muted-foreground">
              Tipo de motor:{" "}
              <span className="font-medium text-foreground/80">
                {status.engineType === "spark" ? "Gasolina" : "Diésel"}
              </span>
            </div>

            {/* Monitors */}
            {status.monitors.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Monitores de emisiones
                </h4>
                <div className="space-y-1">
                  {status.monitors.map((m) => (
                    <MonitorRow key={m.name} monitor={m} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
