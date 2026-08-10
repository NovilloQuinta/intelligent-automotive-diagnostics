import { Link } from '@tanstack/react-router'
import { ScanLine } from 'lucide-react'

export function CTASection() {
  return (
    <section id="cta" className="border-b border-border">
      <div
        className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 0%, rgba(255,107,53,0.10), transparent 60%)',
        }}
      >
        <ScanLine className="mx-auto size-6 text-primary" />
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Empieza a diagnosticar como un profesional
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
          Sin instalaciones. Conecta el adaptador y obtén tu primer informe en minutos.
        </p>
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-block rounded bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            style={{ boxShadow: '0 6px 20px -6px rgba(255,107,53,0.6)' }}
          >
            Crear cuenta gratis
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-primary underline underline-offset-4">
            Inicia sesión
          </Link>
        </p>
      </div>
    </section>
  )
}
