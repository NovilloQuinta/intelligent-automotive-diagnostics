import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AuthUser } from '../../../src/components/dashboard/types'

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

const INDIVIDUAL_USER: AuthUser = {
  id: 1,
  username: 'juan',
  email: 'j@b.com',
  userType: 'individual',
  address: 'C/ Mayor 1',
  createdAt: '2026-01-01',
  isWorkshop: false,
}

const WORKSHOP_USER: AuthUser = {
  id: 2,
  username: 'taller1',
  email: 'taller@b.com',
  userType: 'workshop',
  businessName: 'Talleres AutoPro',
  taxId: 'B12345678',
  address: 'C/ Industria 5',
  createdAt: '2026-01-01',
  isWorkshop: true,
}

const mockAuthState = {
  status: 'authed' as 'loading' | 'authed' | 'anonymous',
  user: INDIVIDUAL_USER as AuthUser | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  verifyTwoFactor: vi.fn(),
}

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const {
  mockUpdateProfile,
  mockChangePassword,
  mockSetupTwoFactor,
  mockActivateTwoFactor,
  mockDisableTwoFactor,
} = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockChangePassword: vi.fn(),
  mockSetupTwoFactor: vi.fn(),
  mockActivateTwoFactor: vi.fn(),
  mockDisableTwoFactor: vi.fn(),
}))

vi.mock('../../../src/lib/api', () => ({
  api: {
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
    setupTwoFactor: mockSetupTwoFactor,
    activateTwoFactor: mockActivateTwoFactor,
    disableTwoFactor: mockDisableTwoFactor,
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { Route } from '../../../src/routes/profile'
const ProfilePage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.status = 'authed'
    mockAuthState.user = INDIVIDUAL_USER
    mockAuthState.refreshUser = vi.fn().mockResolvedValue(undefined)
    mockAuthState.logout = vi.fn().mockResolvedValue(undefined)
  })

  it('redirects to /login when anonymous', () => {
    mockAuthState.status = 'anonymous'
    const { container } = render(<ProfilePage />)
    expect(container.innerHTML).toContain('data-to="/login"')
  })

  it('renders the data tab prefilled with the current user, without an email field', () => {
    render(<ProfilePage />)

    const usernameInput = screen.getByDisplayValue('juan') as HTMLInputElement
    expect(usernameInput).toBeDefined()
    expect(usernameInput.name).toBe('username')
    expect(screen.queryByLabelText(/^email$/i)).toBeNull()
  })

  it('renders the shared header with navigation and footer', () => {
    render(<ProfilePage />)

    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Inicio')).toBeDefined()
    expect(screen.getByText('Historial')).toBeDefined()
    expect(screen.getByText('Perfil')).toBeDefined()
    expect(screen.getByText('Cerrar sesión')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
    expect(screen.getByText('Contacto')).toBeDefined()
  })

  it('does not show workshop fields for an individual user', () => {
    render(<ProfilePage />)
    expect(screen.queryByLabelText(/Nombre del taller/i)).toBeNull()
    expect(screen.queryByLabelText(/CIF/i)).toBeNull()
  })

  it('shows workshop fields for a workshop user', () => {
    mockAuthState.user = WORKSHOP_USER
    render(<ProfilePage />)
    expect(screen.getByDisplayValue('Talleres AutoPro')).toBeDefined()
    expect(screen.getByDisplayValue('B12345678')).toBeDefined()
  })

  it('submits profile updates and refreshes the cached user', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ ...INDIVIDUAL_USER, username: 'juan2' })
    render(<ProfilePage />)

    fireEvent.change(screen.getByDisplayValue('juan'), {
      target: { value: 'juan2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'juan2' }))
    })
    await waitFor(() => {
      expect(mockAuthState.refreshUser).toHaveBeenCalledTimes(1)
    })
  })

  it('switches to the password tab and validates matching passwords', async () => {
    render(<ProfilePage />)

    fireEvent.mouseDown(screen.getByText('Contraseña'))
    await waitFor(() => {
      expect(screen.getByLabelText(/Contraseña actual/i)).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText(/Contraseña actual/i), {
      target: { value: 'OldPass123!' },
    })
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i), {
      target: { value: 'NewPass456!' },
    })
    fireEvent.change(screen.getByLabelText(/Confirmar nueva contraseña/i), {
      target: { value: 'Mismatch789!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByText('Las contraseñas no coinciden')).toBeDefined()
    })
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('submits a password change and logs out locally afterwards', async () => {
    mockChangePassword.mockResolvedValueOnce(undefined)
    render(<ProfilePage />)

    fireEvent.mouseDown(screen.getByText('Contraseña'))
    await waitFor(() => {
      expect(screen.getByLabelText(/Contraseña actual/i)).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText(/Contraseña actual/i), {
      target: { value: 'OldPass123!' },
    })
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i), {
      target: { value: 'NewPass456!' },
    })
    fireEvent.change(screen.getByLabelText(/Confirmar nueva contraseña/i), {
      target: { value: 'NewPass456!' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/i }))

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('OldPass123!', 'NewPass456!')
    })
    await waitFor(() => {
      expect(mockAuthState.logout).toHaveBeenCalledTimes(1)
    })
  })
})

describe('ProfilePage — pestaña Seguridad', () => {
  const SETUP = {
    otpauthUri: 'otpauth://totp/IAD:j@b.com?secret=ABC',
    qrDataUri: 'data:image/png;base64,AAA',
    secret: 'JBSWY3DPEHPK3PXP',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.status = 'authed'
    mockAuthState.user = { ...INDIVIDUAL_USER, twoFactorEnabled: false }
  })

  /** Abre la pestaña Seguridad. Radix cambia de pestaña con `mouseDown`, no con `click`. */
  function openSecurityTab() {
    render(<ProfilePage />)
    fireEvent.mouseDown(screen.getByText('Seguridad'))
  }

  it('ofrece activar el segundo factor cuando no lo tiene', async () => {
    openSecurityTab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /activar/i })).toBeInTheDocument()
    })
  })

  it('al activar, pide el QR y lo muestra', async () => {
    mockSetupTwoFactor.mockResolvedValue(SETUP)
    openSecurityTab()

    fireEvent.click(await screen.findByRole('button', { name: /activar/i }))

    await waitFor(() => {
      expect(screen.getByAltText(/qr/i)).toHaveAttribute('src', SETUP.qrDataUri)
    })
  })

  it('muestra el secreto en texto para quien no pueda escanear', async () => {
    mockSetupTwoFactor.mockResolvedValue(SETUP)
    openSecurityTab()

    fireEvent.click(await screen.findByRole('button', { name: /activar/i }))

    await waitFor(() => {
      expect(screen.getByText(SETUP.secret)).toBeInTheDocument()
    })
  })

  it('confirma con el codigo y enseña los codigos de recuperacion', async () => {
    mockSetupTwoFactor.mockResolvedValue(SETUP)
    mockActivateTwoFactor.mockResolvedValue({ recoveryCodes: ['AB2C-XY7Z', 'QR3M-KT9P'] })
    openSecurityTab()
    fireEvent.click(await screen.findByRole('button', { name: /activar/i }))
    const input = await screen.findByLabelText(/código/i)

    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByText('AB2C-XY7Z')).toBeInTheDocument()
      expect(screen.getByText('QR3M-KT9P')).toBeInTheDocument()
    })
  })

  it('avisa de que los codigos no se vuelven a mostrar', async () => {
    mockSetupTwoFactor.mockResolvedValue(SETUP)
    mockActivateTwoFactor.mockResolvedValue({ recoveryCodes: ['AB2C-XY7Z'] })
    openSecurityTab()
    fireEvent.click(await screen.findByRole('button', { name: /activar/i }))
    fireEvent.change(await screen.findByLabelText(/código/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByText(/no volverán a mostrarse/i)).toBeInTheDocument()
    })
  })

  it('con el segundo factor activo ofrece desactivarlo', async () => {
    mockAuthState.user = { ...INDIVIDUAL_USER, twoFactorEnabled: true }
    openSecurityTab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /desactivar/i })).toBeInTheDocument()
    })
  })

  it('desactivar exige contrasena y codigo', async () => {
    mockAuthState.user = { ...INDIVIDUAL_USER, twoFactorEnabled: true }
    mockDisableTwoFactor.mockResolvedValue(undefined)
    openSecurityTab()

    // Por id: la pestaña de contraseña sigue montada (oculta) y su campo tambien
    // casa con /contraseña/i.
    await waitFor(() => expect(document.querySelector('#profile-2fa-password')).not.toBeNull())
    fireEvent.change(document.querySelector('#profile-2fa-password') as HTMLInputElement, {
      target: { value: 'Diagnostico2026!' },
    })
    fireEvent.change(document.querySelector('#profile-2fa-disable-code') as HTMLInputElement, {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: /desactivar/i }))

    await waitFor(() => {
      expect(mockDisableTwoFactor).toHaveBeenCalledWith({
        password: 'Diagnostico2026!',
        code: '123456',
      })
    })
  })

  it('muestra el error si la activacion falla', async () => {
    mockSetupTwoFactor.mockResolvedValue(SETUP)
    mockActivateTwoFactor.mockRejectedValue(new Error('El código no es válido'))
    openSecurityTab()
    fireEvent.click(await screen.findByRole('button', { name: /activar/i }))
    fireEvent.change(await screen.findByLabelText(/código/i), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByText('El código no es válido')).toBeInTheDocument()
    })
  })
})
