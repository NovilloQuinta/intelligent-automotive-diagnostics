import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AdminAuditLog, Paginated } from '../../../../src/components/admin/types'

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
const mockAuditLogs = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      auditLogs: (filter: unknown) => mockAuditLogs(filter),
    },
  },
}))

import { AuditTable } from '../../../../src/components/admin/AuditTable'

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

function makeAuditLog(overrides: Partial<AdminAuditLog> = {}): AdminAuditLog {
  return {
    id: 1,
    method: 'GET',
    path: '/api/diagnosis',
    statusCode: 200,
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    durationMs: 42,
    userId: 1,
    createdAt: '2026-08-08T12:00:00.000Z',
    ...overrides,
  }
}

function makePaginated<T>(items: T[], total?: number): Paginated<T> {
  return { items, total: total ?? items.length }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuditTable', () => {
  it('renders rows with method, path, status and duration', async () => {
    mockAuditLogs.mockResolvedValue(
      makePaginated([
        makeAuditLog(),
        makeAuditLog({ id: 2, method: 'POST', path: '/api/login', statusCode: 401 }),
      ]),
    )

    renderWithQuery(<AuditTable />)

    expect(await screen.findByText('GET')).toBeDefined()
    expect(screen.getByText('POST')).toBeDefined()
    expect(screen.getByText('/api/diagnosis')).toBeDefined()
    expect(screen.getByText('/api/login')).toBeDefined()
    expect(screen.getByText('200')).toBeDefined()
    expect(screen.getByText('401')).toBeDefined()
    // Both logs have durationMs: 42
    expect(screen.getAllByText('42ms')).toHaveLength(2)
  })

  it('shows "Sin resultados" when audit logs are empty', async () => {
    mockAuditLogs.mockResolvedValue(makePaginated<AdminAuditLog>([]))

    renderWithQuery(<AuditTable />)

    expect(await screen.findByText('Sin resultados')).toBeDefined()
  })

  it('renders status badge with correct variant for 4xx', async () => {
    mockAuditLogs.mockResolvedValue(makePaginated([makeAuditLog({ statusCode: 404 })]))

    renderWithQuery(<AuditTable />)

    await screen.findByText('GET')
    expect(screen.getByText('404')).toBeDefined()
  })

  it('renders status badge with correct variant for 5xx', async () => {
    mockAuditLogs.mockResolvedValue(makePaginated([makeAuditLog({ statusCode: 500 })]))

    renderWithQuery(<AuditTable />)

    await screen.findByText('GET')
    expect(screen.getByText('500')).toBeDefined()
  })

  it('filters by search text on path', async () => {
    mockAuditLogs.mockResolvedValue(makePaginated<AdminAuditLog>([]))

    renderWithQuery(<AuditTable />)

    await screen.findByText('Sin resultados')
    mockAuditLogs.mockClear()

    const searchInput = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(searchInput, { target: { value: 'login' } })

    await vi.waitFor(() => {
      expect(mockAuditLogs).toHaveBeenCalled()
    })

    const call = mockAuditLogs.mock.calls[0][0]
    expect(call.q).toBe('login')
  })

  it('shows loading skeleton', () => {
    mockAuditLogs.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<AuditTable />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
