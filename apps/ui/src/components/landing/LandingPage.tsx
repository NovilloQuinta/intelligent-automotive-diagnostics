import { Link } from '@tanstack/react-router'
import { Gauge } from 'lucide-react'
import { HeroSection } from './HeroSection'
import { FeaturesSection } from './FeaturesSection'
import { StepsSection } from './StepsSection'
import { ProtocolsSection } from './ProtocolsSection'
import { TestimonialsSection } from './TestimonialsSection'
import { CTASection } from './CTASection'
import { FooterSection } from './FooterSection'

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
              style={{ boxShadow: '0 6px 20px -6px rgba(255,107,53,0.6)' }}
            >
              Registrarse
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <StepsSection />
        <ProtocolsSection />
        <TestimonialsSection />
        <CTASection />
      </main>

      <FooterSection />
    </div>
  )
}
