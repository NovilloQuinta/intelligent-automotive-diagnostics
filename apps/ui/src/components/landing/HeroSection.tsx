import { Link } from '@tanstack/react-router'
import { SectionLabel, Led } from './landing-utils'

function Mockup() {
  return (
    <div className="panel scan-sweep relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          ECU · LIVE
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[var(--success)]">
          <Led /> Conectado
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-md border border-border bg-foreground/[0.02] p-4">
          <div className="relative mx-auto grid size-28 place-items-center rounded-full border-4 border-border">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'conic-gradient(var(--primary) 0deg 220deg, transparent 220deg 360deg)',
                mask: 'radial-gradient(circle, transparent 60%, black 61%)',
                WebkitMask: 'radial-gradient(circle, transparent 60%, black 61%)',
              }}
              aria-hidden
            />
            <div className="text-center">
              <p className="mono text-2xl font-bold text-foreground">3 240</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                rpm
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { l: 'Velocidad', v: '72 km/h', p: 60 },
            { l: 'Refrigerante', v: '94 °C', p: 82 },
            { l: 'Admisión', v: '38 °C', p: 34 },
          ].map((r) => (
            <div key={r.l}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.l}
                </span>
                <span className="mono text-sm font-semibold text-foreground">{r.v}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${r.p}%`,
                    background:
                      'linear-gradient(to right, #1e6bff 0%, #00d4aa 40%, #ff6b35 75%, #ff3333 100%)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {[
          { c: 'P0301', d: 'Fallo de encendido cilindro 1', color: 'var(--danger)' },
          { c: 'P0171', d: 'Mezcla pobre banco 1', color: 'var(--warning)' },
        ].map((d) => (
          <div
            key={d.c}
            className="flex items-center gap-3 rounded-md border border-border bg-foreground/[0.02] px-3 py-2"
          >
            <span className="size-2 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="mono text-sm font-bold" style={{ color: d.color }}>
              {d.c}
            </span>
            <span className="truncate text-xs text-muted-foreground">{d.d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HeroSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="fade-up">
          <SectionLabel>
            <Led /> Diagnóstico inteligente con IA
          </SectionLabel>
          <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(100deg, #ff6b35, #00d4aa)',
              }}
            >
              Diagnóstico automotriz
            </span>
            <br />
            <span className="text-foreground">con Inteligencia Artificial</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            Conecta, escanea y diagnostica cualquier vehículo con tecnología OBD-II asistida por IA
            generativa. Para talleres profesionales y particulares exigentes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="rounded bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              style={{ boxShadow: '0 6px 20px -6px rgba(255,107,53,0.6)' }}
            >
              Comenzar ahora
            </Link>
            <Link
              to="/login"
              className="rounded border border-white/15 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary"
            >
              Ver demo
            </Link>
          </div>
        </div>
        <div className="fade-up">
          <Mockup />
        </div>
      </div>
    </section>
  )
}
