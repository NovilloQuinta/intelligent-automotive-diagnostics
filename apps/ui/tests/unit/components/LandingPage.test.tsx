import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => ({
    status: 'anonymous' as const,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))

import { LandingPage } from '../../../src/components/landing/LandingPage'

describe('LandingPage', () => {
  it('renders the hero heading and subtitle', () => {
    render(<LandingPage />)

    expect(screen.getByText('Diagnóstico automotriz')).toBeDefined()
    expect(screen.getByText('con Inteligencia Artificial')).toBeDefined()
  })

  it('links every call-to-action to /login', () => {
    render(<LandingPage />)

    const ctaLabels = [
      'Comenzar ahora',
      'Ver demo',
      'Crear cuenta gratis',
      'Inicia sesión',
      'Iniciar sesión',
      'Registrarse',
    ]
    for (const label of ctaLabels) {
      const link = screen.getByText(label).closest('a')
      expect(link?.getAttribute('href')).toBe('/login')
    }
  })

  it('renders the three feature cards', () => {
    render(<LandingPage />)

    expect(screen.getByText('Escaneo OBD-II en tiempo real')).toBeDefined()
    expect(screen.getByText('Diagnóstico con IA generativa')).toBeDefined()
    expect(screen.getByText('Historial y reportes PDF')).toBeDefined()
  })

  it('renders the how-it-works steps', () => {
    render(<LandingPage />)

    expect(screen.getByText('Conecta el escáner')).toBeDefined()
    expect(screen.getByText('Lee códigos y telemetría')).toBeDefined()
    expect(screen.getByText('Recibe el diagnóstico')).toBeDefined()
  })

  it('renders all supported protocols', () => {
    render(<LandingPage />)

    for (const protocol of ['OBD-II', 'CAN BUS', 'ISO 9141-2', 'KWP2000']) {
      expect(screen.getByText(protocol)).toBeDefined()
    }
  })

  it('renders workshop testimonials', () => {
    render(<LandingPage />)

    expect(screen.getByText('Marc Vidal')).toBeDefined()
    expect(screen.getByText('Lucía Ferrer')).toBeDefined()
    expect(screen.getByText('Óscar Ruiz')).toBeDefined()
  })

  it('renders the footer legal links', () => {
    render(<LandingPage />)

    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
    expect(screen.getByText('Contacto')).toBeDefined()
  })
})
