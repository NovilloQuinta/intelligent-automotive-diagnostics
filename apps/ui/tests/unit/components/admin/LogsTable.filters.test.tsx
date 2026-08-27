import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockLogs = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      logs: (filter: unknown) => mockLogs(filter),
    },
  },
}))

// El doble sustituye al `Select` de Radix, que jsdom no sabe abrir. Ver filtersStub.
vi.mock('../../../../src/components/admin/DataTableFilters', async () => {
  const { FiltersStub } = await import('./filtersStub')
  return { DataTableFilters: FiltersStub }
})

import { LogsTable } from '../../../../src/components/admin/LogsTable'
import { STUB_RANGE } from './filtersStubData'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function lastFilter() {
  return mockLogs.mock.calls.at(-1)?.[0]
}

describe('LogsTable — filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogs.mockResolvedValue({ items: [], total: 0 })
  })

  it('aplica el rango de fechas y vuelve a la pagina 1', async () => {
    renderWithQuery(<LogsTable />)
    await waitFor(() => expect(mockLogs).toHaveBeenCalled())

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
    renderWithQuery(<LogsTable />)
    await waitFor(() => expect(mockLogs).toHaveBeenCalled())

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-page-size'))

    await waitFor(() => expect(lastFilter()).toMatchObject({ page: 1, pageSize: 50 }))
  })

  it('filtra por nivel y vuelve a la pagina 1', async () => {
    renderWithQuery(<LogsTable />)
    await waitFor(() => expect(mockLogs).toHaveBeenCalled())
    expect(lastFilter()).toMatchObject({ level: undefined })

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-level'))

    await waitFor(() => expect(lastFilter()).toMatchObject({ level: 'error', page: 1 }))
  })
})
