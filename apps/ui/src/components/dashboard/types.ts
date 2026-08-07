import type {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
} from "lucide-react";

// ---------------------------------------------------------------------------
// API contracts — keep in sync with apps/core-api/src/application/dto/
// ---------------------------------------------------------------------------

/** Vehicle scenario as returned by GET /api/scenarios. */
export type Scenario = {
  id: string;
  name: string;
  vehicleType: "car" | "motorcycle";
  sensorValues: {
    rpm: number;
    coolantTemp: number;
    speed: number;
    intakeTemp: number;
  };
  dtcConfig: { code: string; description: string }[];
  vehicleInfo: {
    make: string;
    model: string;
    year: number;
    engineType: string;
    vin: string;
  };
};

export type Severity = "low" | "medium" | "high" | "critical";

/** Diagnosis result as returned by POST /api/diagnosis. */
export type DiagnosisResponse = {
  rawData: string;
  parsedValues: {
    rpm: number;
    coolantTemp: number;
    speed: number;
    intakeTemp: number;
  };
  dtcCodes: { code: string; description: string }[];
  diagnosisText: string;
  severity: Severity;
};

/** Live telemetry snapshot (client-side jitter from sensorValues baseline). */
export type TelemetrySnapshot = {
  rpm: number;
  speed: number;
  coolantTemp: number;
  intakeTemp: number;
  rawData: string;
  ts: number;
};

/** OBD-II freeze frame snapshot as returned by GET /api/freeze-frame. */
export type FreezeFrame = {
  dtcCode: string;
  pidValues: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  userType: "individual" | "workshop";
  businessName?: string | null;
  taxId?: string | null;
  address?: string | null;
  createdAt: string;
  isWorkshop: boolean;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  userType: "individual" | "workshop";
  businessName?: string;
  taxId?: string;
  address?: string;
};

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

export const COLORS = {
  destructive: "#ff3333",
  primary: "#ff6b35",
  accent: "#00d4aa",
  background: "#0d1117",
  warning: "#f5b301",
  accentMuted: "#7fe9d0",
} as const;

export const GAUGE = {
  RPM_MAX: 8_000,
  RPM_DANGER: 6_500,
  COOLANT_MAX: 130,
  COOLANT_ALARM: 100,
  INTAKE_MAX: 120,
  INTAKE_WARN: 80,
  ANIM_DURATION_MS: 400,
  SVG_RADIUS: 78,
  SVG_CENTER_X: 100,
  SVG_CENTER_Y: 100,
  TICK_COUNT: 9,
  SPEED_DISPLAY_WIDTH: 3,
} as const;

export const COOLANT_TICK_POSITIONS = [0, 25, 50, 75, 100] as const;

export const GRADIENTS = {
  coolant:
    "linear-gradient(to top, #1e6bff 0%, #00d4aa 40%, #ff6b35 75%, #ff3333 100%)",
  coolantGlow: "0 0 8px rgba(0,212,170,0.4)",
  coolantAlarmGlow: "0 0 12px #ff3333",
  intake: "linear-gradient(to right, #1e6bff, #00d4aa, #ff6b35, #ff3333)",
  intakeGlow: "0 0 6px rgba(0,212,170,0.4)",
  intakeWarnGlow: "0 0 10px #ff6b35",
} as const;

export const SVG_STROKES = {
  bgArc: "rgba(255,255,255,0.08)",
  tickLine: "rgba(255,255,255,0.35)",
  dangerZone: "rgba(255,51,51,0.35)",
  primaryGlow:
    "0 6px 20px -6px rgba(255,107,53,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
  dtcGlow: "0 0 12px rgba(255,107,53,0.4)",
} as const;

export const DTC_COLORS = {
  noCodesBg: "rgba(0,212,170,0.06)",
  noCodesBorder: "rgba(0,212,170,0.25)",
} as const;

export const BUTTON_COLORS = {
  idleBg: "linear-gradient(180deg, #ff8455, #ff6b35)",
  loadingBg: "rgba(255,107,53,0.25)",
} as const;

export type SeverityMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon:
    | typeof AlertTriangle
    | typeof CheckCircle2
    | typeof Info
    | typeof ShieldAlert;
};
