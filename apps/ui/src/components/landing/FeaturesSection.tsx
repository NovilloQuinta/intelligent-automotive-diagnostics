import { Activity, FileText, Plug } from 'lucide-react'
import { SectionLabel } from './landing-utils'

const features = [
  {
    icon: Plug,
    title: 'Escaneo OBD-II en tiempo real',
    text: 'Lectura continua de RPM, temperatura, velocidad y sensores directamente del bus del vehículo.',
  },
  {
    icon: Activity,
    title: 'Diagnóstico con IA generativa',
    text: 'La IA correlaciona telemetría y códigos DTC para explicar la causa raíz en lenguaje de taller.',
  },
  {
    icon: FileText,
    title: 'Historial y reportes PDF',
    text: 'Cada escaneo queda registrado por matrícula y se exporta como informe listo para el cliente.',
  },
]

const flow = ['Conectar', 'Escanear', 'Diagnosticar', 'Reparar']

/** Sección de landing con las 3 capacidades principales (escaneo, IA, historial). Contenido estático hardcodeado. */
export function FeaturesSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Capacidades</SectionLabel>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Todo el taller en una sola herramienta
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-lg border border-border bg-foreground/[0.02] p-6 transition-colors hover:border-primary/40"
            >
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>

        {/* FLOW */}
        <ol className="mt-12 flex flex-col gap-4 md:flex-row md:items-center">
          {flow.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/50 mono text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {s}
                </span>
              </div>
              {i < flow.length - 1 && (
                <span className="dash-line hidden h-px flex-1 md:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
