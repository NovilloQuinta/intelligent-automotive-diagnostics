import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PidObservation } from "@/lib/api";
import type { DiagnosisResponse } from "./types";
import { COLORS, GAUGE } from "./types";

export type PidStatus = "ok" | "review";

/** Origin of a PID row: the 4 fixed readings of the diagnosis, or a PID discovered by the AI. */
export type PidSource = "fixed" | "ai";

export type PidRow = {
  code: string;
  description: string;
  value: string;
  status: PidStatus;
  source: PidSource;
};

/** Codes always rendered from `DiagnosisResponse.parsedValues` — AI rows never duplicate them. */
export const FIXED_PID_CODES: ReadonlySet<string> = new Set([
  "01 0C",
  "01 05",
  "01 0D",
  "01 0F",
]);

export type PidStatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof CheckCircle2 | typeof AlertTriangle;
};

/** Maps a PID status to its visual metadata (color, icon, label, background). */
export function pidStatusMeta(status: PidStatus): PidStatusMeta {
  if (status === "review") {
    return {
      label: "Revisar",
      color: COLORS.warning,
      bg: "rgba(245,179,1,0.08)",
      border: "rgba(245,179,1,0.3)",
      icon: AlertTriangle,
    };
  }
  return {
    label: "OK",
    color: COLORS.accent,
    bg: "rgba(0,212,170,0.08)",
    border: "rgba(0,212,170,0.3)",
    icon: CheckCircle2,
  };
}

/** Builds the fixed PID rows read during a diagnosis session from its parsed OBD-II values. */
export function buildPidRows(
  parsedValues: DiagnosisResponse["parsedValues"],
): PidRow[] {
  const { rpm, coolantTemp, speed, intakeTemp } = parsedValues;
  return [
    {
      code: "01 0C",
      description: "Régimen del motor",
      value: `${rpm} RPM`,
      status: rpm > GAUGE.RPM_DANGER ? "review" : "ok",
      source: "fixed",
    },
    {
      code: "01 05",
      description: "Temperatura del refrigerante",
      value: `${coolantTemp}°C`,
      status: coolantTemp > GAUGE.COOLANT_ALARM ? "review" : "ok",
      source: "fixed",
    },
    {
      code: "01 0D",
      description: "Velocidad del vehículo",
      value: `${speed} km/h`,
      status: "ok",
      source: "fixed",
    },
    {
      code: "01 0F",
      description: "Temperatura del aire de admisión",
      value: `${intakeTemp}°C`,
      status: intakeTemp > GAUGE.INTAKE_WARN ? "review" : "ok",
      source: "fixed",
    },
  ];
}

/** Maps a backend PID observation to a table row tagged as AI-discovered. */
export function pidObservationToRow(obs: PidObservation): PidRow {
  return {
    code: obs.code,
    description: obs.name,
    value: obs.unit ? `${obs.value} ${obs.unit}` : `${obs.value}`,
    status: obs.status,
    source: "ai",
  };
}

/**
 * Appends the AI-discovered rows after the fixed ones, dropping any code already
 * rendered as a fixed PID and deduplicating the AI rows by code (last read wins).
 */
export function mergePidRows(
  fixedRows: PidRow[],
  aiRows: PidRow[] | null,
): PidRow[] {
  if (!aiRows || aiRows.length === 0) return fixedRows;

  const byCode = new Map<string, PidRow>();
  for (const row of aiRows) {
    if (FIXED_PID_CODES.has(row.code)) continue;
    byCode.set(row.code, row);
  }

  return [...fixedRows, ...byCode.values()];
}
