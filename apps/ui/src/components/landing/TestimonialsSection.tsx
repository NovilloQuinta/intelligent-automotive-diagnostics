import { Star, Wrench } from 'lucide-react'
import { SectionLabel } from './landing-utils'

const testimonials = [
  {
    name: 'Marc Vidal',
    shop: 'Taller Vidal · Andorra la Vella',
    quote:
      'Reducimos el tiempo de diagnóstico a la mitad. El informe de la IA nos ahorra explicar el fallo al cliente.',
  },
  {
    name: 'Lucía Ferrer',
    shop: 'MotorPro · Valencia',
    quote:
      'La telemetría en vivo es lo que nos faltaba. Detectamos fallos intermitentes que antes se nos escapaban.',
  },
  {
    name: 'Óscar Ruiz',
    shop: 'Ruiz Mecánica · Zaragoza',
    quote: 'Interfaz clarísima. En dos días todo el equipo la usaba sin formación.',
  },
]

/** Testimonios de talleres en la landing. Contenido estático hardcodeado, no viene del backend. */
export function TestimonialsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Talleres</SectionLabel>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Ya diagnostican con IA
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-lg border border-border bg-foreground/[0.02] p-6"
            >
              <div className="flex gap-1" aria-label="5 de 5 estrellas">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="size-3.5"
                    style={{
                      color: 'var(--warning)',
                      fill: 'var(--warning)',
                    }}
                  />
                ))}
              </div>
              <blockquote className="mt-4 text-sm leading-relaxed text-foreground">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full border border-border bg-foreground/5">
                  <Wrench className="size-4 text-primary" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t.shop}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
