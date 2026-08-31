import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockAuthState = {
  status: 'anonymous' as string,
  user: null as unknown,
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
  Navigate: ({ to }: { to: string }) =>
    `<navigate data-to="${to}" data-testid="navigate" />` as unknown as JSX.Element,
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { Route } from '../../../src/routes/login'
const AuthPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.status = 'anonymous'
    mockAuthState.user = null
  })

  it('renders login tab by default', () => {
    render(<AuthPage />)
    expect(screen.getByRole('tab', { name: /Iniciar sesión/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /Registrarse/i })).toBeDefined()
  })

  it('renders the shared header (without auth actions) and footer', () => {
    render(<AuthPage />)

    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
    expect(screen.getByText('Contacto')).toBeDefined()
  })

  it('shows register form when tab clicked', async () => {
    render(<AuthPage />)
    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(screen.getByText('Usuario')).toBeDefined()
    })
  })

  it('validates email on login form', async () => {
    render(<AuthPage />)
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/i }))
    await waitFor(() => {
      expect(screen.getByText('Email inválido')).toBeDefined()
    })
  })

  it('validates required fields on register', async () => {
    render(<AuthPage />)
    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(screen.getByText('Crear cuenta')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))
    await waitFor(() => {
      expect(screen.getByText('Mínimo 3 caracteres')).toBeDefined()
    })
  })

  it('renders loading state', () => {
    mockAuthState.status = 'loading'
    render(<AuthPage />)
    expect(screen.getByText('Cargando…')).toBeDefined()
  })

  it('renders Navigate when authed', () => {
    mockAuthState.status = 'authed'
    const { container } = render(<AuthPage />)
    expect(container.innerHTML).toContain('data-to="/"')
  })

  it('submits login form and calls login', async () => {
    const login = vi.fn().mockResolvedValue(undefined)
    mockAuthState.login = login
    render(<AuthPage />)

    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        rememberMe: true,
      })
    })
  })

  it('switches between login and register tabs', async () => {
    render(<AuthPage />)
    // Start on login tab
    expect(screen.getByPlaceholderText('tu@email.com')).toBeDefined()

    // Switch to register
    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('usuario123')).toBeDefined()
    })

    // Switch back to login
    fireEvent.click(screen.getByRole('tab', { name: /Iniciar sesión/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('tu@email.com')).toBeDefined()
    })
  })

  it('submits register form with required fields', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    mockAuthState.register = register
    const { container } = render(<AuthPage />)

    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(screen.getByText('Crear cuenta')).toBeDefined()
    })

    const usernameInput = container.querySelector('#reg-username') as HTMLInputElement
    const emailInput = container.querySelector('#reg-email') as HTMLInputElement
    const passwordInput = container.querySelector('#reg-password') as HTMLInputElement
    fireEvent.change(usernameInput, { target: { value: 'juan' } })
    fireEvent.change(emailInput, { target: { value: 'j@b.com' } })
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'juan',
          email: 'j@b.com',
          password: 'Password123!',
          userType: 'individual',
        }),
      )
    })
  })

  it('rejects a register password missing complexity requirements', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    mockAuthState.register = register
    const { container } = render(<AuthPage />)

    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(screen.getByText('Crear cuenta')).toBeDefined()
    })

    const usernameInput = container.querySelector('#reg-username') as HTMLInputElement
    const emailInput = container.querySelector('#reg-email') as HTMLInputElement
    const passwordInput = container.querySelector('#reg-password') as HTMLInputElement
    fireEvent.change(usernameInput, { target: { value: 'juan' } })
    fireEvent.change(emailInput, { target: { value: 'j@b.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Debe incluir 1 mayúscula, 1 número y 1 carácter especial'),
      ).toBeDefined()
    })
    expect(register).not.toHaveBeenCalled()
  })

  it('renders a link to /forgot-password on the login form', () => {
    render(<AuthPage />)
    const link = screen.getByText('¿Olvidaste tu contraseña?')
    expect(link.closest('a')?.getAttribute('href')).toBe('/forgot-password')
  })

  it('toggles password visibility on login and register forms', async () => {
    const { container } = render(<AuthPage />)

    const loginPassword = container.querySelector('#login-password') as HTMLInputElement
    expect(loginPassword.type).toBe('password')
    fireEvent.click(screen.getByLabelText('Mostrar contraseña'))
    expect(loginPassword.type).toBe('text')
    fireEvent.click(screen.getByLabelText('Ocultar contraseña'))
    expect(loginPassword.type).toBe('password')

    fireEvent.mouseDown(screen.getByText('Registrarse'))
    await waitFor(() => {
      expect(container.querySelector('#reg-password')).not.toBeNull()
    })
    const regPassword = container.querySelector('#reg-password') as HTMLInputElement
    expect(regPassword.type).toBe('password')
    fireEvent.click(screen.getByLabelText('Mostrar contraseña'))
    expect(regPassword.type).toBe('text')
  })
})

describe('AuthPage — segundo factor', () => {
  beforeEach(() => {
    mockAuthState.status = 'anonymous'
    mockAuthState.user = null
    vi.clearAllMocks()
  })

  /**
   * Rellena credenciales y envia el primer paso.
   *
   * Por id y no por etiqueta: las dos pestañas se renderizan a la vez, asi que
   * `/contraseña/i` encuentra tambien el campo del formulario de registro.
   */
  async function submitCredentials() {
    fireEvent.change(document.querySelector('#login-email') as HTMLInputElement, {
      target: { value: 'taller@example.com' },
    })
    fireEvent.change(document.querySelector('#login-password') as HTMLInputElement, {
      target: { value: 'Diagnostico2026!' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /iniciar sesión/i })[0])
  }

  it('pide el codigo cuando el login devuelve un reto', async () => {
    mockAuthState.login.mockResolvedValue({
      kind: 'twoFactorRequired',
      challengeToken: 'reto-abc',
      expiresAt: '2026-08-26T12:05:00.000Z',
    })
    render(<Route.options.component />)

    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText(/código/i)).toBeInTheDocument()
    })
  })

  it('canjea el reto con el codigo que se teclea', async () => {
    mockAuthState.login.mockResolvedValue({
      kind: 'twoFactorRequired',
      challengeToken: 'reto-abc',
      expiresAt: '2026-08-26T12:05:00.000Z',
    })
    mockAuthState.verifyTwoFactor.mockResolvedValue(undefined)
    render(<Route.options.component />)
    await submitCredentials()
    await waitFor(() => expect(screen.getByLabelText(/código/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }))

    await waitFor(() => {
      expect(mockAuthState.verifyTwoFactor).toHaveBeenCalledWith('reto-abc', '123456')
    })
  })

  it('muestra el error si el codigo es incorrecto y deja reintentar', async () => {
    mockAuthState.login.mockResolvedValue({
      kind: 'twoFactorRequired',
      challengeToken: 'reto-abc',
      expiresAt: '2026-08-26T12:05:00.000Z',
    })
    mockAuthState.verifyTwoFactor.mockRejectedValue(new Error('El código no es válido'))
    render(<Route.options.component />)
    await submitCredentials()
    await waitFor(() => expect(screen.getByLabelText(/código/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }))

    await waitFor(() => {
      expect(screen.getByText('El código no es válido')).toBeInTheDocument()
    })
    // El reto sigue vivo: el campo sigue ahi para reintentar sin repetir el login.
    expect(screen.getByLabelText(/código/i)).toBeInTheDocument()
  })

  it('el boton de volver descarta el reto y devuelve al formulario', async () => {
    mockAuthState.login.mockResolvedValue({
      kind: 'twoFactorRequired',
      challengeToken: 'reto-abc',
      expiresAt: '2026-08-26T12:05:00.000Z',
    })
    render(<Route.options.component />)
    await submitCredentials()
    await waitFor(() => expect(screen.getByLabelText(/código/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /volver/i }))

    await waitFor(() => {
      expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
    })
  })

  it('el login sin segundo factor no pide codigo', async () => {
    mockAuthState.login.mockResolvedValue({ kind: 'tokens' })
    render(<Route.options.component />)

    await submitCredentials()

    await waitFor(() => expect(mockAuthState.login).toHaveBeenCalled())
    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
  })
})

describe('AuthPage — recordar la sesion', () => {
  const REMEMBER_LABEL = /Mantener la sesión iniciada en este dispositivo/i

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.status = 'anonymous'
    mockAuthState.user = null
    localStorage.clear()
  })

  it('pinta la casilla marcada en la primera visita', () => {
    render(<AuthPage />)

    expect(screen.getByLabelText(REMEMBER_LABEL)).toHaveProperty('checked', true)
  })

  it('devuelve la casilla como la dejo el usuario', () => {
    localStorage.setItem('iad.rememberMe', 'false')

    render(<AuthPage />)

    expect(screen.getByLabelText(REMEMBER_LABEL)).toHaveProperty('checked', false)
  })

  it('prerrellena el email recordado y deja la contrasena vacia', () => {
    localStorage.setItem('iad.rememberedEmail', 'mecanico@taller.com')

    render(<AuthPage />)

    expect(screen.getByPlaceholderText('tu@email.com')).toHaveProperty(
      'value',
      'mecanico@taller.com',
    )
    expect(screen.getByPlaceholderText('••••••••')).toHaveProperty('value', '')
  })

  it('manda la eleccion al desmarcar la casilla', async () => {
    const login = vi.fn().mockResolvedValue({ kind: 'tokens' })
    mockAuthState.login = login
    render(<AuthPage />)

    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByLabelText(REMEMBER_LABEL))
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        rememberMe: false,
      })
    })
  })

  it('el paso del segundo factor no vuelve a preguntar por la casilla', async () => {
    mockAuthState.login = vi.fn().mockResolvedValue({
      kind: 'twoFactorRequired',
      challengeToken: 'reto-abc',
      expiresAt: '2026-08-31T12:05:00.000Z',
    })
    render(<AuthPage />)

    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), {
      target: { value: 'a@b.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/Código de verificación/i)).toBeDefined()
    })
    expect(screen.queryByLabelText(REMEMBER_LABEL)).toBeNull()
  })

  it('la pestaña de registro no pinta la casilla', async () => {
    render(<AuthPage />)

    fireEvent.mouseDown(screen.getByText('Registrarse'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('usuario123')).toBeDefined()
    })
    expect(screen.queryByLabelText(REMEMBER_LABEL)).toBeNull()
  })
})
