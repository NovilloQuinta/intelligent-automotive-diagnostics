import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockAuditLogs = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      auditLogs: (filter: unknown) => mockAuditLogs(filter),
    },
  },
}))

// Solo se dobla `DataTableFilters`. El `Select` de status y el input de user ID
// los renderiza `AuditTable` en persona, y se manejan de verdad. Ver filtersStub.
vi.mock('../../../../src/components/admin/DataTableFilters', async () => {
  const { FiltersStub } = await import('./filtersStub')
  return { DataTableFilters: FiltersStub }
})

import { AuditTable } from '../../../../src/components/admin/AuditTable'
import { STUB_RANGE } from './filtersStubData'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function lastFilter() {
  return mockAuditLogs.mock.calls.at(-1)?.[0]
}

describe('AuditTable — filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditLogs.mockResolvedValue({ items: [], total: 0 })
  })

  it('aplica el rango de fechas y vuelve a la pagina 1', async () => {
    renderWithQuery(<AuditTable />)
    await waitFor(() => expect(mockAuditLogs).toHaveBeenCalled())

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-range'))

    await waitFor(() => {
      expect(lastFilter()).toMatchObject({
        page: 1,
        from: STUB_RANGE.from,
        to: STUB_RANGE.to,
      })
    })
  })

  it('cambia el tamano de pagina y vuelve a la pagina 1', async () => {
    renderWithQuery(<AuditTable />)
    await waitFor(() => expect(mockAuditLogs).toHaveBeenCalled())

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-page-size'))

    await waitFor(() => expect(lastFilter()).toMatchObject({ page: 1, pageSize: 50 }))
  })

  it('filtra por codigo de estado con el desplegable', async () => {
    renderWithQuery(<AuditTable />)
    await waitFor(() => expect(mockAuditLogs).toHaveBeenCalled())
    expect(lastFilter()).toMatchObject({ statusCode: undefined })

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: '500' }))

    await waitFor(() => expect(lastFilter()).toMatchObject({ statusCode: 500, page: 1 }))
  })

  // 'all' no es un codigo: tiene que limpiar el filtro, no mandar NaN al backend.
  it('vuelve a todos los codigos al elegir "Todos"', async () => {
    renderWithQuery(<AuditTable />)
    await waitFor(() => expect(mockAuditLogs).toHaveBeenCalled())

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: '500' }))
    await waitFor(() => expect(lastFilter()).toMatchObject({ statusCode: 500 }))

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Todos' }))

    await waitFor(() => expect(lastFilter()).toMatchObject({ statusCode: undefined }))
  })

  it('filtra por user ID y lo limpia al vaciar el campo', async () => {
    renderWithQuery(<AuditTable />)
    await waitFor(() => expect(mockAuditLogs).toHaveBeenCalled())

    const userIdInput = screen.getByPlaceholderText('User ID')
    await userEvent.type(userIdInput, '42')
    await waitFor(() => expect(lastFilter()).toMatchObject({ userId: 42, page: 1 }))

    await userEvent.clear(userIdInput)
    await waitFor(() => expect(lastFilter()).toMatchObject({ userId: undefined }))
  })
})
