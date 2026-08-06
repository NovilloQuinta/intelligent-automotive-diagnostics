import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { DiagnosisResponse } from "./types";
import { COLORS, GAUGE } from "./types";

export type PidStatus = "ok" | "review";

export type PidRow = {
  code: string;
  description: string;
  value: string;
  status: PidStatus;
};

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
    },
    {
      code: "01 05",
      description: "Temperatura del refrigerante",
      value: `${coolantTemp}°C`,
      status: coolantTemp > GAUGE.COOLANT_ALARM ? "review" : "ok",
    },
    {
      code: "01 0D",
      description: "Velocidad del vehículo",
      value: `${speed} km/h`,
      status: "ok",
    },
    {
      code: "01 0F",
      description: "Temperatura del aire de admisión",
      value: `${intakeTemp}°C`,
      status: intakeTemp > GAUGE.INTAKE_WARN ? "review" : "ok",
    },
  ];
}
