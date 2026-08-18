import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'

const routerMock = vi.hoisted(() => ({ invalidate: vi.fn() }))

vi.mock('@tanstack/react-router', () => {
  let routeConfig: unknown = null
  return {
    createRootRouteWithContext: () => (config: unknown) => {
      routeConfig = config
      return {
        options: config,
        useRouteContext: () => ({
          queryClient: { clear: vi.fn(), getQueryData: vi.fn() },
        }),
      }
    },
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
    Outlet: () => null,
    useRouter: () => ({ invalidate: routerMock.invalidate }),
  }
})

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => ({
    status: 'anonymous',
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { Route } from '../../../src/routes/__root'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const options = (Route as any).options as {
  notFoundComponent: ComponentType
  errorComponent: ComponentType<{ error: Error; reset: () => void }>
}

const { notFoundComponent: NotFoundComponent, errorComponent: ErrorComponent } = options

describe('__root', () => {
  beforeEach(() => {
    routerMock.invalidate.mockClear()
  })

  it.skip('should render RootComponent with Outlet', () => {
    const RootComponent = (Route as unknown as { options: { component: ComponentType } }).options
      .component
    render(<RootComponent />)
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('should render 404 and not-found message in NotFoundComponent', () => {
    render(<NotFoundComponent />)
    expect(screen.getByText('404')).toBeDefined()
    expect(screen.getByText('Página no encontrada')).toBeDefined()
  })

  it('should render error message and Reintentar calls router.invalidate and reset', () => {
    const reset = vi.fn()
    render(<ErrorComponent error={new Error('boom')} reset={reset} />)

    expect(screen.getByText('Esta página no cargó')).toBeDefined()

    fireEvent.click(screen.getByText('Reintentar'))

    expect(routerMock.invalidate).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('should not log the error to the console', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<ErrorComponent error={new Error('boom')} reset={vi.fn()} />)

    expect(consoleError).not.toHaveBeenCalled()
  })
})
