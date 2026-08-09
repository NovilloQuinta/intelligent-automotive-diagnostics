import { History, LogOut, ScanLine, Shield, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useClock } from "./useClock";
import { VehicleSelector } from "./VehicleSelector";
import { ConnectionTypeIcon } from "./ConnectionTypeIcon";
import { COLORS } from "./types";
import type { Scenario } from "./types";

const DEFAULT_LOCALE = "es-ES";

function Branding() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
        <ScanLine className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="text-[15px] font-bold leading-tight tracking-tight">
          Intelligent Automotive{" "}
          <span className="text-primary">Diagnostics</span>
        </div>
        <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Herramienta OBD-II · Diagnóstico Asistido por IA
        </div>
      </div>
    </div>
  );
}

function ConnectionStatus({ streamOk }: { streamOk: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
      <span
        className={`led-dot h-2 w-2 rounded-full ${streamOk ? "" : "opacity-30"}`}
        style={{ background: streamOk ? COLORS.accent : COLORS.destructive }}
      />
      <span
        className="mono text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: streamOk ? COLORS.accent : COLORS.destructive }}
      >
        {streamOk ? "Conectado" : "Sin conexión"}
      </span>
    </div>
  );
}

interface TopBarProps {
  scenarios: Scenario[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  streamOk: boolean;
  onLogout: () => void;
}

export function TopBar({
  scenarios,
  selectedId,
  onSelect,
  loading,
  streamOk,
  onLogout,
}: TopBarProps) {
  const auth = useAuth();
  const now = useClock();
  const timeStr = now
    ? now.toLocaleTimeString(DEFAULT_LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  const selectedScenario = scenarios.find((s) => s.id === selectedId);

  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-black/40 px-6 py-3 backdrop-blur">
      <Branding />
      <div className="flex flex-wrap items-center gap-4">
        <ConnectionStatus streamOk={streamOk} />
        {selectedScenario?.connectionType ? (
          <ConnectionTypeIcon
            connectionType={selectedScenario.connectionType}
          />
        ) : null}
        <div className="mono flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Hora
          </span>
          <span className="tabular-nums">{timeStr}</span>
        </div>
        <VehicleSelector
          scenarios={scenarios}
          value={selectedId}
          onChange={onSelect}
          disabled={loading || scenarios.length === 0}
        />
        <Link
          to="/history"
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          title="Historial de diagnósticos"
        >
          <History className="h-3.5 w-3.5" />
          Historial
        </Link>
        <Link
          to="/profile"
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          title="Mi perfil"
        >
          <User className="h-3.5 w-3.5" />
        </Link>
        {auth.user?.isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/20"
            title="Panel de administración"
          >
            <Shield className="h-3.5 w-3.5" />
            Admin
          </Link>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
          title="Cerrar sesión"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
