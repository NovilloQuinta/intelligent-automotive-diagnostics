import { HeroSection } from './HeroSection'
import { FeaturesSection } from './FeaturesSection'
import { StepsSection } from './StepsSection'
import { ProtocolsSection } from './ProtocolsSection'
import { TestimonialsSection } from './TestimonialsSection'
import { CTASection } from './CTASection'
import { FooterSection } from './FooterSection'
import { Header } from '@/components/layout/Header'

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

      <Header />

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
