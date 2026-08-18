import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminUser, Paginated } from '../../../../src/components/admin/types'

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
const mockUsers = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      users: (filter: unknown) => mockUsers(filter),
    },
  },
}))

import { UsersTable } from '../../../../src/components/admin/UsersTable'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 1,
    username: 'john_doe',
    email: 'john@example.com',
    userType: 'individual',
    role: 'user',
    businessName: null,
    taxId: null,
    address: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    failedLoginAttempts: 0,
    lockedUntil: null,
    isWorkshop: false,
    isAdmin: false,
    ...overrides,
  }
}

function makePaginated<T>(items: T[], total?: number): Paginated<T> {
  return { items, total: total ?? items.length }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('UsersTable', () => {
  it('renders email, username, userType, role and registration date', async () => {
    mockUsers.mockResolvedValue(
      makePaginated([
        makeUser(),
        makeUser({
          id: 2,
          username: 'admin_user',
          email: 'admin@example.com',
          userType: 'workshop',
          role: 'admin',
          isWorkshop: true,
          isAdmin: true,
        }),
      ]),
    )

    renderWithQuery(<UsersTable />)

    expect(await screen.findByText('john@example.com')).toBeDefined()
    expect(screen.getByText('admin@example.com')).toBeDefined()
    expect(screen.getByText('john_doe')).toBeDefined()
    expect(screen.getByText('admin_user')).toBeDefined()
    expect(screen.getByText('individual')).toBeDefined()
    expect(screen.getByText('workshop')).toBeDefined()
    expect(screen.getByText('user')).toBeDefined()
    expect(screen.getByText('admin')).toBeDefined()
  })

  it('does NOT render passwordHash', async () => {
    mockUsers.mockResolvedValue(makePaginated([makeUser()]))

    renderWithQuery(<UsersTable />)

    await screen.findByText('john@example.com')

    // passwordHash must NOT appear anywhere in the document
    expect(screen.queryByText(/password/i)).toBeNull()
  })

  it('shows "Sin resultados" when user list is empty', async () => {
    mockUsers.mockResolvedValue(makePaginated<AdminUser>([]))

    renderWithQuery(<UsersTable />)

    expect(await screen.findByText('Sin resultados')).toBeDefined()
  })

  it('renders userType badge individual as default variant', async () => {
    mockUsers.mockResolvedValue(makePaginated([makeUser({ userType: 'individual' })]))

    renderWithQuery(<UsersTable />)

    await screen.findByText('john@example.com')
    expect(screen.getByText('individual')).toBeDefined()
  })

  it('renders role badge admin', async () => {
    mockUsers.mockResolvedValue(
      makePaginated([
        makeUser({
          role: 'admin',
          isAdmin: true,
        }),
      ]),
    )

    renderWithQuery(<UsersTable />)

    await screen.findByText('john@example.com')
    expect(screen.getByText('admin')).toBeDefined()
  })

  it('shows loading skeleton', () => {
    mockUsers.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<UsersTable />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
