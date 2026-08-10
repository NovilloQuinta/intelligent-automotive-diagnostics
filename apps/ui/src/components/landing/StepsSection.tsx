import { SectionLabel } from './landing-utils'

const steps = [
  {
    n: '01',
    title: 'Conecta el escáner',
    text: 'Enchufa el adaptador OBD-II al puerto de diagnóstico del vehículo, bajo el volante.',
  },
  {
    n: '02',
    title: 'Lee códigos y telemetría',
    text: 'La app recoge los DTC almacenados y transmite los parámetros en vivo a 2 Hz.',
  },
  {
    n: '03',
    title: 'Recibe el diagnóstico',
    text: 'La IA analiza los datos y genera un informe con severidad, causa probable y reparación.',
  },
]

export function StepsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <SectionLabel>Metodología</SectionLabel>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Cómo funciona
        </h2>
        <div className="mt-10 space-y-2">
          {steps.map((s, i) => (
            <div key={s.n} className="flex gap-6">
              <div className="flex flex-col items-center">
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-primary/50 mono text-sm font-bold text-primary"
                  style={{
                    boxShadow: '0 6px 20px -6px rgba(255,107,53,0.6)',
                  }}
                >
                  {s.n}
                </span>
                {i < steps.length - 1 && <span className="dash-line-v w-px flex-1" aria-hidden />}
              </div>
              <div className="pb-10">
                <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
