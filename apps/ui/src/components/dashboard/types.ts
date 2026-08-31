import type { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'

// API contracts — keep in sync with apps/core-api/src/application/dto/

/** Vehicle scenario as returned by GET /api/scenarios. */
export type Scenario = {
  id: string
  name: string
  vehicleType: 'car' | 'motorcycle' | 'unknown'
  connectionType: 'wifi' | 'usb' | 'bluetooth'
  sensorValues: {
    rpm: number
    coolantTemp: number
    speed: number
    intakeTemp: number
  }
  dtcConfig: DtcCode[]
  vehicleInfo: {
    make: string
    model: string
    year: number
    engineType: string
    vin: string
  }
}

export type Severity = 'low' | 'medium' | 'high' | 'critical'

/** Diagnosis result as returned by POST /api/diagnosis. */
export type DiagnosisResponse = {
  rawData: string
  parsedValues: {
    rpm: number
    coolantTemp: number
    speed: number
    intakeTemp: number
  }
  dtcCodes: DtcCode[]
  diagnosisText: string
  severity: Severity
}

/** Live telemetry snapshot returned by GET /api/live-data (one poll cycle). */
export type TelemetrySnapshot = {
  rpm: number
  speed: number
  coolantTemp: number
  intakeTemp: number
  rawData: string
  ts: number
}

/**
 * Single PID reading from the generic `readings` array of `GET /api/live-data`.
 * `value: null` means that single PID failed its read (NO DATA); the entry is
 * kept so the UI can render a `—` placeholder without shifting the layout.
 */
export type PidReading = {
  readonly code: string
  readonly name: string
  readonly unit: string
  readonly value: number | null
}

/** Selectable Mode 01 PID from the `GET /api/available-pids` catalog. */
export type AvailablePid = {
  readonly code: string
  readonly name: string
  readonly unit: string
  /**
   * Healthy operating window decided by the domain, absent when the catalog does
   * not judge this PID. The dashboard applies it; it never defines it.
   */
  readonly operatingWindow?: {
    readonly min?: number
    readonly max?: number
  }
}

/** OBD-II freeze frame snapshot as returned by GET /api/freeze-frame. */
export type FreezeFrame = {
  dtcCode: string
  pidValues: Record<string, number>
}

/** ECU info as returned by GET /api/ecu-info. */
export type EcuInfo = {
  id: number
  vehicleId: number
  name: string
  requestAddr: string
  responseAddr: string
  type: string
  protocol: string
  discoveredAt?: string
  /**
   * De donde sale el nombre: `catalog` lo dicta la norma (que solo estandariza el
   * motor), `ai` lo averiguo el diagnostico cognitivo. Se muestra con la insignia
   * IA, igual que los PIDs descubiertos por el agente.
   */
  source?: 'catalog' | 'ai'
}

/**
 * Identified vehicle as returned by GET /api/vehicle-info. The decoded fields
 * are null when the VIN is not decodable (noisy ELM327 read, placeholder VIN).
 */
export type VehicleInfoResponse = {
  vin: string
  make: string
  model: string
  year: number
  engineType: string
  manufacturer: string | null
  region: { country: string; region: string } | null
  modelYearDecoded: number | null
}

/** Identificación que aporta el mecánico cuando la cascada no saca el coche. */
export type VehicleIdentityInput = {
  vin: string
  make: string
  model?: string
  year?: number
  engineType?: string
}

/** Qué acabó pasando con lo que aportó el mecánico. */
export type VehicleIdentityConfirmation = {
  vehicle: { make: string; model: string; year: number; engineType: string }
  /** `true` si la marca subió al catálogo de WMI, no solo a este vehículo. */
  promoted: boolean
  /** Presente cuando ese WMI ya tenía otra marca: se conserva la conocida. */
  conflict?: { known: string; claimed: string }
  /** Incoherencias que no bloquean, para mostrarlas junto al formulario. */
  warnings: string[]
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthUser = {
  id: number
  username: string
  email: string
  userType: 'individual' | 'workshop'
  businessName?: string | null
  taxId?: string | null
  address?: string | null
  createdAt: string
  isWorkshop: boolean
  role: 'user' | 'admin'
  isAdmin: boolean
  /**
   * Si el segundo factor esta activo. El **secreto** no viaja nunca: el backend
   * lo mantiene fuera de la entidad para que la proyeccion publica no pueda
   * filtrarlo.
   */
  twoFactorEnabled: boolean
}

export type LoginInput = {
  email: string
  password: string
  /**
   * Casilla "Recordarme". Alarga la sesion y decide donde se guardan los
   * tokens; la contrasena no se guarda en ningun caso.
   */
  rememberMe?: boolean
}

export type RegisterInput = {
  username: string
  email: string
  password: string
  userType: 'individual' | 'workshop'
  businessName?: string
  taxId?: string
  address?: string
}

export type ForgotPasswordInput = {
  email: string
}

export type ResetPasswordInput = {
  token: string
  newPassword: string
}

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
}

export type UpdateProfileInput = Partial<{
  username: string
  address: string
  businessName: string
  taxId: string
}>

/** OBD-II Diagnostic Trouble Code. */
export type DtcCode = {
  code: string
  description: string
  /**
   * Direccion de la ECU que reporta la averia (`7E8`), cuando el bus la dijo.
   *
   * Opcional: una lectura con las cabeceras apagadas devuelve el codigo sin
   * origen, y sigue siendo una averia legitima.
   */
  ecuAddress?: string
}

/** Emission monitor readiness status. */
export type MonitorStatus = {
  name: string
  supported: boolean
  completed: boolean
}

/** Vehicle status as returned by GET /api/vehicle-status. */
export type VehicleStatusOutput = {
  milOn: boolean
  dtcCount: number
  engineType: 'spark' | 'compression'
  monitors: MonitorStatus[]
}

export const COLORS = {
  destructive: '#ff3333',
  primary: '#ff6b35',
  accent: '#00d4aa',
  background: '#0d1117',
  warning: '#f5b301',
  accentMuted: '#7fe9d0',
} as const

/**
 * Drawing scales of the dashboard gauges — how far the dial goes, not when to worry.
 *
 * The health thresholds that used to live here (`RPM_DANGER`, `COOLANT_ALARM`,
 * `INTAKE_WARN`) were a copy of the domain's operating windows. They now travel with
 * the PID catalog (`AvailablePid.operatingWindow`) so the OK/Revisar verdict is decided
 * in one place. What stays is presentation: the full-scale value of each gauge and the
 * SVG geometry.
 */
export const GAUGE = {
  RPM_MAX: 8_000,
  COOLANT_MAX: 130,
  INTAKE_MAX: 120,
  ANIM_DURATION_MS: 400,
  SVG_RADIUS: 78,
  SVG_CENTER_X: 100,
  SVG_CENTER_Y: 100,
  TICK_COUNT: 9,
  SPEED_DISPLAY_WIDTH: 3,
} as const

export const COOLANT_TICK_POSITIONS = [0, 25, 50, 75, 100] as const

export const GRADIENTS = {
  coolant: 'linear-gradient(to top, #1e6bff 0%, #00d4aa 40%, #ff6b35 75%, #ff3333 100%)',
  coolantGlow: '0 0 8px rgba(0,212,170,0.4)',
  coolantAlarmGlow: '0 0 12px #ff3333',
  intake: 'linear-gradient(to right, #1e6bff, #00d4aa, #ff6b35, #ff3333)',
  intakeGlow: '0 0 6px rgba(0,212,170,0.4)',
  intakeWarnGlow: '0 0 10px #ff6b35',
} as const

export const SVG_STROKES = {
  bgArc: 'rgba(255,255,255,0.08)',
  tickLine: 'rgba(255,255,255,0.35)',
  dangerZone: 'rgba(255,51,51,0.35)',
  primaryGlow: '0 6px 20px -6px rgba(255,107,53,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
  dtcGlow: '0 0 12px rgba(255,107,53,0.4)',
} as const

export const DTC_COLORS = {
  noCodesBg: 'rgba(0,212,170,0.06)',
  noCodesBorder: 'rgba(0,212,170,0.25)',
} as const

export const BUTTON_COLORS = {
  idleBg: 'linear-gradient(180deg, #ff8455, #ff6b35)',
  loadingBg: 'rgba(255,107,53,0.25)',
} as const

export type SeverityMeta = {
  label: string
  color: string
  bg: string
  border: string
  icon: typeof AlertTriangle | typeof CheckCircle2 | typeof Info | typeof ShieldAlert
}

// Diagnosis history types — keep in sync with GET /api/diagnosis-history

/** Session summary as returned by the diagnosis history list endpoint. */
export type DiagnosisSession = {
  readonly id: number
  readonly vehicleId: number | null
  readonly scenarioId: string | null
  readonly startedAt: string
  readonly endedAt: string | null
  readonly severity: string | null
  readonly dtcCount: number | null
}

/** Paginated response from GET /api/diagnosis-history. */
export type DiagnosisHistoryResponse = {
  readonly items: DiagnosisSession[]
  readonly total: number
}

/** Session detail as returned by GET /api/diagnosis-history/:id. */
export type DiagnosisSessionDetail = DiagnosisSession & {
  readonly resultJson: string | null
}
