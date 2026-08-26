import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuthState = {
  status: 'loading' as string,
  user: null as {
    id: number
    username: string
    email: string
    userType: 'individual' | 'workshop'
    isWorkshop: boolean
    role: 'user' | 'admin'
    isAdmin: boolean
    createdAt: string
    businessName?: string | null
    taxId?: string | null
    address?: string | null
  } | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
  Outlet: () => "<outlet data-testid='outlet' />" as unknown as JSX.Element,
  Navigate: ({ to }: { to: string }) =>
    `<navigate data-to="${to}" data-testid="navigate" />` as unknown as JSX.Element,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/admin' }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// Import the route component after mocks are set up
import { Route } from '../../../src/routes/admin'
const AdminLayout = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function setAuth(status: string, user: typeof mockAuthState.user) {
  mockAuthState.status = status
  mockAuthState.user = user
}

function makeUser(overrides: Partial<NonNullable<typeof mockAuthState.user>> = {}) {
  return {
    id: 1,
    username: 'tester',
    email: 't@example.com',
    userType: 'individual' as const,
    isWorkshop: false,
    role: 'user' as const,
    isAdmin: false,
    // Por defecto activo: el panel lo exige, y casi todos los casos de este
    // fichero miden el guard de rol, no el del segundo factor.
    twoFactorEnabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminLayout route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuth('loading', null)
  })

  // -- loading ---------------------------------------------------------------

  it('renders a loading indicator when auth status is loading', () => {
    setAuth('loading', null)
    render(<AdminLayout />)
    expect(screen.getByText(/cargando/i)).toBeDefined()
  })

  // -- anonymous / no user ---------------------------------------------------

  it('redirects to /login when auth status is anonymous', () => {
    setAuth('anonymous', null)
    const { container } = render(<AdminLayout />)
    expect(container.innerHTML).toContain('data-to="/login"')
  })

  // -- non-admin user --------------------------------------------------------

  it('shows access denied (403) when user is not admin', () => {
    setAuth('authed', makeUser({ role: 'user', isAdmin: false }))
    const { container } = render(<AdminLayout />)
    expect(screen.getByText(/acceso denegado/i)).toBeDefined()
    // Must NOT redirect — stays on the page with the 403 message
    expect(screen.queryByTestId('navigate')).toBeNull()
    // Should NOT render children
    expect(container.innerHTML).not.toContain('outlet')
  })

  // -- admin user ------------------------------------------------------------

  it('manda a activar el segundo factor si el admin no lo tiene', () => {
    // El backend responde 403 al panel en ese caso: la UI lo dice antes y explica
    // donde arreglarlo, en vez de dejar un error generico.
    setAuth('authed', makeUser({ role: 'admin', isAdmin: true, twoFactorEnabled: false }))
    const { container } = render(<AdminLayout />)
    expect(container.innerHTML).not.toContain('outlet')
    expect(container.textContent).toMatch(/segundo factor/i)
  })

  it('renders children via Outlet when user is admin', () => {
    setAuth('authed', makeUser({ role: 'admin', isAdmin: true }))
    const { container } = render(<AdminLayout />)
    expect(container.innerHTML).toContain('outlet')
  })

  // -- edge cases ------------------------------------------------------------

  it('redirects to /login when user is null even if status is somehow authed', () => {
    setAuth('authed', null)
    const { container } = render(<AdminLayout />)
    expect(container.innerHTML).toContain('data-to="/login"')
  })
})
