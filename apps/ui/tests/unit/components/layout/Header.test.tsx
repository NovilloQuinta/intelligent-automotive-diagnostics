import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockAuthState = {
  status: 'anonymous' as 'loading' | 'authed' | 'anonymous',
  user: null as unknown,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../../../src/lib/auth-context', () => ({
  useAuth: () => mockAuthState,
}))

import { Header } from '../../../../src/components/layout/Header'

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.status = 'anonymous'
    mockAuthState.logout = vi.fn().mockResolvedValue(undefined)
  })

  it('renders the brand name and auth actions for anonymous visitors', () => {
    render(<Header />)

    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Iniciar sesión')).toBeDefined()
    expect(screen.getByText('Registrarse')).toBeDefined()
  })

  it('links the auth actions to /login', () => {
    render(<Header />)

    for (const label of ['Iniciar sesión', 'Registrarse']) {
      expect(screen.getByText(label).closest('a')?.getAttribute('href')).toBe('/login')
    }
  })

  it('hides auth actions when showAuthActions is false', () => {
    render(<Header showAuthActions={false} />)

    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.queryByText('Iniciar sesión')).toBeNull()
    expect(screen.queryByText('Registrarse')).toBeNull()
  })

  it('renders authenticated navigation instead of auth actions', () => {
    mockAuthState.status = 'authed'
    render(<Header />)

    expect(screen.getByText('Inicio')).toBeDefined()
    expect(screen.getByText('Historial')).toBeDefined()
    expect(screen.getByText('Perfil')).toBeDefined()
    expect(screen.getByText('Cerrar sesión')).toBeDefined()
    expect(screen.queryByText('Iniciar sesión')).toBeNull()
    expect(screen.queryByText('Registrarse')).toBeNull()
  })

  it('links authenticated navigation to the right routes', () => {
    mockAuthState.status = 'authed'
    render(<Header />)

    expect(screen.getByText('Inicio').closest('a')?.getAttribute('href')).toBe('/')
    expect(screen.getByText('Historial').closest('a')?.getAttribute('href')).toBe('/history')
    expect(screen.getByText('Perfil').closest('a')?.getAttribute('href')).toBe('/profile')
  })
})
