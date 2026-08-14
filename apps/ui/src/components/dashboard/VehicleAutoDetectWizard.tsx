import { useState } from 'react'
import { Bike, Car, RadarIcon, ScanLine, TriangleAlert } from 'lucide-react'
import { extractErrorMessage } from '@/lib/errors'
import { COLORS } from './types'
import { CONNECTION_TYPE_LABELS } from './ConnectionTypeIcon'
import type {
  Scenario,
  VehicleIdentityConfirmation,
  VehicleIdentityInput,
  VehicleInfoResponse,
} from './types'
import type { VehicleAutoDetectStep } from './useVehicleAutoDetect'

/** Orden de los pasos visibles del wizard (`done` ya no muestra wizard). */
const STEP_LABELS: { key: VehicleAutoDetectStep; label: string }[] = [
  { key: 'selecting', label: 'Conexión' },
  { key: 'detecting', label: 'Lectura VIN' },
  { key: 'confirming', label: 'Confirmación' },
]

function StepIndicator({ step }: { step: VehicleAutoDetectStep }) {
  const currentIndex = STEP_LABELS.findIndex((s) => s.key === step)
  return (
    <ol className="mono flex items-center gap-3 text-[10px] uppercase tracking-[0.2em]">
      {STEP_LABELS.map((s, i) => (
        <li key={s.key} className={i <= currentIndex ? 'text-primary' : 'text-muted-foreground/60'}>
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  )
}

function ConnectionButton({
  scenario,
  onSelect,
}: {
  scenario: Scenario
  onSelect: (id: string) => void
}) {
  const Icon = scenario.vehicleType === 'motorcycle' ? Bike : Car
  const { make, model, year } = scenario.vehicleInfo
  return (
    <button
      onClick={() => onSelect(scenario.id)}
      className="flex w-full items-center gap-4 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-black/60"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold">{scenario.name}</span>
        <span
          data-testid={`connection-type-${scenario.id}`}
          className="mono block text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          {CONNECTION_TYPE_LABELS[scenario.connectionType]}
        </span>
        <span className="mono block text-[10px] uppercase tracking-wider text-muted-foreground">
          {make} {model} · {year}
        </span>
      </span>
      <ScanLine className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}

function SelectingStep({
  scenarios,
  onSelect,
}: {
  scenarios: Scenario[]
  onSelect: (id: string) => void
}) {
  if (scenarios.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No hay conexiones disponibles
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {scenarios.map((s) => (
        <ConnectionButton key={s.id} scenario={s} onSelect={onSelect} />
      ))}
    </div>
  )
}

function DetectingStep({
  error,
  onRetry,
  onBack,
}: {
  error: string | null
  onRetry: () => void
  onBack: () => void
}) {
  if (error) {
    return (
      <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            Reintentar
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            Elegir otro vehículo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-black/40 px-4 py-10 text-center">
      <RadarIcon
        data-testid="autodetect-spinner"
        className="mx-auto h-10 w-10 animate-spin text-primary"
      />
      <p className="text-sm font-semibold">Detectando vehículo…</p>
      <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Leyendo VIN · Modo 09 PID 02
      </p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  )
}

const UNIDENTIFIED = 'unknown'

/** Campo de texto del formulario de corrección, con su etiqueta asociada. */
function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}) {
  return (
    <label className="block rounded-md border border-white/10 bg-black/30 px-3 py-2">
      <span className="mono block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
      />
    </label>
  )
}

/**
 * Última rama de la cascada: el mecánico está delante del coche y sabe lo que es.
 *
 * Solo se ofrece cuando la identificación automática no ha salido, para no pedir
 * trabajo manual sobre un coche que el sistema ya conoce. El servidor decide qué
 * sube al catálogo compartido y qué se queda en este vehículo, así que aquí se
 * muestra su respuesta — conflicto y avisos incluidos — y no lo que se tecleó.
 */
function ManualIdentityForm({
  vin,
  onSaveIdentity,
}: {
  readonly vin: string
  readonly onSaveIdentity: (input: VehicleIdentityInput) => Promise<VehicleIdentityConfirmation>
}) {
  const [open, setOpen] = useState(false)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<VehicleIdentityConfirmation | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/20"
      >
        Identificar a mano
      </button>
    )
  }

  const handleSave = async () => {
    // La marca es la clave con la que el catalogo archiva y recupera: sin ella
    // no hay nada que guardar.
    if (!make.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const trimmedModel = model.trim()
      setResult(
        await onSaveIdentity({
          vin,
          make: make.trim(),
          ...(trimmedModel ? { model: trimmedModel } : {}),
        }),
      )
    } catch (e: unknown) {
      setError(extractErrorMessage(e, 'No se pudo guardar la identificación'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <p className="text-xs text-muted-foreground">
        No hemos podido identificar el vehículo. Indícalo tú y quedará aprendido para la próxima.
      </p>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <TextField label="Marca" value={make} onChange={setMake} placeholder="Peugeot" />
        <TextField label="Modelo" value={model} onChange={setModel} placeholder="208" />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result?.conflict && (
        <p className="text-xs text-yellow-500">
          Ese identificador ya está registrado como {result.conflict.known}, así que se conserva esa
          marca en el catálogo. El vehículo queda guardado con lo que has indicado.
        </p>
      )}

      {result?.warnings.map((warning) => (
        <p key={warning} className="text-xs text-yellow-500">
          {warning}
        </p>
      ))}

      {result && !result.conflict && (
        <p className="text-xs text-primary">Identificación guardada.</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !make.trim()}
        className="rounded-md border border-primary/40 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-40"
      >
        Guardar identificación
      </button>
    </div>
  )
}

function ConfirmingStep({
  vehicle,
  scenarioId,
  onConfirm,
  onBack,
  onSaveIdentity,
}: {
  vehicle: VehicleInfoResponse
  scenarioId: string
  onConfirm: (scenarioId: string) => void
  onBack: () => void
  onSaveIdentity: (input: VehicleIdentityInput) => Promise<VehicleIdentityConfirmation>
}) {
  const decoded = vehicle.manufacturer ?? vehicle.region ?? vehicle.modelYearDecoded
  const needsIdentity = vehicle.make === UNIDENTIFIED
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          VIN leído
        </div>
        <div className="mono text-lg font-bold tracking-[0.15em]" style={{ color: COLORS.accent }}>
          {vehicle.vin}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Marca" value={vehicle.make} />
        <Field label="Modelo" value={vehicle.model} />
        <Field label="Año" value={String(vehicle.year)} />
        <Field label="Motor" value={vehicle.engineType} />
      </div>

      {decoded === null ? (
        <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          VIN no decodificable
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="Fabricante (WMI)" value={vehicle.manufacturer ?? '—'} />
          <Field
            label="Origen"
            value={vehicle.region ? `${vehicle.region.country} · ${vehicle.region.region}` : '—'}
          />
          <Field
            label="Año de modelo"
            value={vehicle.modelYearDecoded === null ? '—' : String(vehicle.modelYearDecoded)}
          />
        </div>
      )}

      {needsIdentity && <ManualIdentityForm vin={vehicle.vin} onSaveIdentity={onSaveIdentity} />}

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-white/10 px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          Elegir otro vehículo
        </button>
        <button
          onClick={() => onConfirm(scenarioId)}
          className="rounded-md border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/25"
        >
          Entrar a diagnóstico
        </button>
      </div>
    </div>
  )
}

type Props = {
  scenarios: Scenario[]
  step: VehicleAutoDetectStep
  scenarioId: string
  vehicle: VehicleInfoResponse | null
  error: string | null
  onSelect: (id: string) => void
  onRetry: () => void
  onBack: () => void
  onConfirm: (scenarioId: string) => void
  /** Corrección del mecánico, última rama de la cascada de identificación. */
  onSaveIdentity: (input: VehicleIdentityInput) => Promise<VehicleIdentityConfirmation>
}

/**
 * Full-screen vehicle identification wizard: pick a connection, read and
 * decode the VIN, and confirm the identified vehicle before the diagnosis
 * menu opens. Mirrors the "Vehicle Menu" step of a professional scan tool.
 */
export function VehicleAutoDetectWizard({
  scenarios,
  step,
  scenarioId,
  vehicle,
  error,
  onSelect,
  onRetry,
  onBack,
  onConfirm,
  onSaveIdentity,
}: Props) {
  return (
    <main className="flex-1 p-4 md:p-6">
      <section className="mx-auto max-w-3xl space-y-5 rounded-xl border border-white/10 bg-black/40 p-5 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold uppercase tracking-wider text-foreground/90">
            Identificación del vehículo
          </h1>
          <StepIndicator step={step} />
        </header>

        {step === 'selecting' && <SelectingStep scenarios={scenarios} onSelect={onSelect} />}
        {step === 'detecting' && <DetectingStep error={error} onRetry={onRetry} onBack={onBack} />}
        {step === 'confirming' && vehicle && (
          <ConfirmingStep
            vehicle={vehicle}
            scenarioId={scenarioId}
            onConfirm={onConfirm}
            onBack={onBack}
            onSaveIdentity={onSaveIdentity}
          />
        )}
      </section>
    </main>
  )
}
