import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockAuthState = {
  status: 'anonymous' as 'loading' | 'authed' | 'anonymous',
  user: null as unknown,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
}))

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../src/components/dashboard/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="dashboard-page" />,
}))

vi.mock('../../../src/components/landing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page" />,
}))

import { Route } from '../../../src/routes/index'
const HomeRoute = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

describe('index route', () => {
  beforeEach(() => {
    mockAuthState.status = 'anonymous'
  })

  it('renders the landing page when anonymous', () => {
    render(<HomeRoute />)

    expect(screen.getByTestId('landing-page')).toBeDefined()
    expect(screen.queryByTestId('dashboard-page')).toBeNull()
  })

  it('renders the dashboard when authed', () => {
    mockAuthState.status = 'authed'
    render(<HomeRoute />)

    expect(screen.getByTestId('dashboard-page')).toBeDefined()
    expect(screen.queryByTestId('landing-page')).toBeNull()
  })

  it('renders a loading state while auth status is resolving', () => {
    mockAuthState.status = 'loading'
    render(<HomeRoute />)

    expect(screen.getByText('Cargando…')).toBeDefined()
    expect(screen.queryByTestId('dashboard-page')).toBeNull()
    expect(screen.queryByTestId('landing-page')).toBeNull()
  })
})
