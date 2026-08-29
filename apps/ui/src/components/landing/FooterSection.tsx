import { Gauge } from 'lucide-react'

/** Pie de pagina publico y del historial: version en runtime (new Date().getFullYear()) + enlaces legales. */
export function FooterSection() {
  return (
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
  )
}
