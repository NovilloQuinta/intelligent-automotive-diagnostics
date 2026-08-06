import { Link } from "@tanstack/react-router";
import {
  Activity,
  Cable,
  Car,
  FileText,
  Gauge,
  Plug,
  ScanLine,
  Star,
  Wrench,
} from "lucide-react";

const badgeClass =
  "inline-flex items-center gap-2 rounded-full border border-border bg-foreground/5 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground";

function Led() {
  return (
    <span
      className="led-dot inline-block size-2 rounded-full bg-[var(--success)]"
      aria-hidden
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className={badgeClass}>{children}</span>;
}

const features = [
  {
    icon: Plug,
    title: "Escaneo OBD-II en tiempo real",
    text: "Lectura continua de RPM, temperatura, velocidad y sensores directamente del bus del vehículo.",
  },
  {
    icon: Activity,
    title: "Diagnóstico con IA generativa",
    text: "La IA correlaciona telemetría y códigos DTC para explicar la causa raíz en lenguaje de taller.",
  },
  {
    icon: FileText,
    title: "Historial y reportes PDF",
    text: "Cada escaneo queda registrado por matrícula y se exporta como informe listo para el cliente.",
  },
];

const flow = ["Conectar", "Escanear", "Diagnosticar", "Reparar"];

const steps = [
  {
    n: "01",
    title: "Conecta el escáner",
    text: "Enchufa el adaptador OBD-II al puerto de diagnóstico del vehículo, bajo el volante.",
  },
  {
    n: "02",
    title: "Lee códigos y telemetría",
    text: "La app recoge los DTC almacenados y transmite los parámetros en vivo a 2 Hz.",
  },
  {
    n: "03",
    title: "Recibe el diagnóstico",
    text: "La IA analiza los datos y genera un informe con severidad, causa probable y reparación.",
  },
];

const protocols = [
  "OBD-II",
  "CAN BUS",
  "ISO 9141-2",
  "KWP2000",
  "SAE J1850 PWM",
  "SAE J1850 VPW",
];

const testimonials = [
  {
    name: "Marc Vidal",
    shop: "Taller Vidal · Andorra la Vella",
    quote:
      "Reducimos el tiempo de diagnóstico a la mitad. El informe de la IA nos ahorra explicar el fallo al cliente.",
  },
  {
    name: "Lucía Ferrer",
    shop: "MotorPro · Valencia",
    quote:
      "La telemetría en vivo es lo que nos faltaba. Detectamos fallos intermitentes que antes se nos escapaban.",
  },
  {
    name: "Óscar Ruiz",
    shop: "Ruiz Mecánica · Zaragoza",
    quote:
      "Interfaz clarísima. En dos días todo el equipo la usaba sin formación.",
  },
];

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
                background:
                  "conic-gradient(var(--primary) 0deg 220deg, transparent 220deg 360deg)",
                mask: "radial-gradient(circle, transparent 60%, black 61%)",
                WebkitMask:
                  "radial-gradient(circle, transparent 60%, black 61%)",
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
            { l: "Velocidad", v: "72 km/h", p: 60 },
            { l: "Refrigerante", v: "94 °C", p: 82 },
            { l: "Admisión", v: "38 °C", p: 34 },
          ].map((r) => (
            <div key={r.l}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.l}
                </span>
                <span className="mono text-sm font-semibold text-foreground">
                  {r.v}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${r.p}%`,
                    background:
                      "linear-gradient(to right, #1e6bff 0%, #00d4aa 40%, #ff6b35 75%, #ff3333 100%)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {[
          {
            c: "P0301",
            d: "Fallo de encendido cilindro 1",
            color: "var(--danger)",
          },
          { c: "P0171", d: "Mezcla pobre banco 1", color: "var(--warning)" },
        ].map((d) => (
          <div
            key={d.c}
            className="flex items-center gap-3 rounded-md border border-border bg-foreground/[0.02] px-3 py-2"
          >
            <span
              className="size-2 rounded-full"
              style={{ background: d.color }}
              aria-hidden
            />
            <span className="mono text-sm font-bold" style={{ color: d.color }}>
              {d.c}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {d.d}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Public marketing homepage shown to anonymous visitors at "/". */
export function LandingPage() {
  return (
    <div className="relative z-10 min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded border border-border bg-foreground/5">
              <Gauge className="size-4 text-primary" />
            </span>
            <span className="text-sm font-bold tracking-tight text-foreground sm:text-base">
              IADiagnostics
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Acceso">
            <Link
              to="/login"
              className="rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary sm:text-sm"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/login"
              className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 sm:text-sm"
              style={{ boxShadow: "0 6px 20px -6px rgba(255,107,53,0.6)" }}
            >
              Registrarse
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        {/* HERO */}
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
                    backgroundImage:
                      "linear-gradient(100deg, #ff6b35, #00d4aa)",
                  }}
                >
                  Diagnóstico automotriz
                </span>
                <br />
                <span className="text-foreground">
                  con Inteligencia Artificial
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
                Conecta, escanea y diagnostica cualquier vehículo con tecnología
                OBD-II asistida por IA generativa. Para talleres profesionales y
                particulares exigentes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="rounded bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                  style={{ boxShadow: "0 6px 20px -6px rgba(255,107,53,0.6)" }}
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

        {/* FEATURES */}
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
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.text}
                  </p>
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
                    <span
                      className="dash-line hidden h-px flex-1 md:block"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* HOW IT WORKS */}
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
                        boxShadow: "0 6px 20px -6px rgba(255,107,53,0.6)",
                      }}
                    >
                      {s.n}
                    </span>
                    {i < steps.length - 1 && (
                      <span className="dash-line-v w-px flex-1" aria-hidden />
                    )}
                  </div>
                  <div className="pb-10">
                    <h3 className="text-base font-semibold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {s.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TECH SPECS */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionLabel>Compatibilidad</SectionLabel>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Protocolos soportados
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {protocols.map((p) => (
                <div
                  key={p}
                  className="rounded-md border border-border bg-foreground/[0.02] px-3 py-4 text-center"
                >
                  <Cable className="mx-auto size-4 text-[var(--success)]" />
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {p}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <Car className="size-3.5" /> Compatible con vehículos desde 1996
              (OBD-II estándar)
            </p>
          </div>
        </section>

        {/* TESTIMONIALS */}
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
                          color: "var(--warning)",
                          fill: "var(--warning)",
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
                      <span className="block text-sm font-semibold text-foreground">
                        {t.name}
                      </span>
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

        {/* CTA */}
        <section id="cta" className="border-b border-border">
          <div
            className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 0%, rgba(255,107,53,0.10), transparent 60%)",
            }}
          >
            <ScanLine className="mx-auto size-6 text-primary" />
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Empieza a diagnosticar como un profesional
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
              Sin instalaciones. Conecta el adaptador y obtén tu primer informe
              en minutos.
            </p>
            <div className="mt-8">
              <Link
                to="/login"
                className="inline-block rounded bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                style={{ boxShadow: "0 6px 20px -6px rgba(255,107,53,0.6)" }}
              >
                Crear cuenta gratis
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link
                to="/login"
                className="text-primary underline underline-offset-4"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              IADiagnostics · © {new Date().getFullYear()} · v1.0.0
            </span>
          </div>
          <nav
            className="flex gap-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            aria-label="Enlaces legales"
          >
            <a href="#cta" className="transition-colors hover:text-primary">
              Términos
            </a>
            <a href="#cta" className="transition-colors hover:text-primary">
              Privacidad
            </a>
            <a href="#cta" className="transition-colors hover:text-primary">
              Contacto
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
