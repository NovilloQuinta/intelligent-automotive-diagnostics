import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUsers = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      users: (filter: unknown) => mockUsers(filter),
    },
  },
}))

// El doble sustituye al `Select` de Radix, que jsdom no sabe abrir. Ver filtersStub.
vi.mock('../../../../src/components/admin/DataTableFilters', async () => {
  const { FiltersStub } = await import('./filtersStub')
  return { DataTableFilters: FiltersStub }
})

import { UsersTable } from '../../../../src/components/admin/UsersTable'
import { STUB_RANGE } from './filtersStub'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** Ultimo filtro con el que se pidio la lista. */
function lastFilter() {
  return mockUsers.mock.calls.at(-1)?.[0]
}

describe('UsersTable — filtros', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsers.mockResolvedValue({ items: [], total: 0 })
  })

  it('pide la lista con la pagina y el tamano por defecto', async () => {
    renderWithQuery(<UsersTable />)

    await waitFor(() => expect(mockUsers).toHaveBeenCalled())
    expect(lastFilter()).toMatchObject({ page: 1, pageSize: 20 })
  })

  it('aplica el rango de fechas y refetchea con el', async () => {
    renderWithQuery(<UsersTable />)
    await waitFor(() => expect(mockUsers).toHaveBeenCalled())

    await userEvent.click(screen.getByText('set-range'))

    await waitFor(() => {
      expect(lastFilter()).toMatchObject({ from: STUB_RANGE.from, to: STUB_RANGE.to })
    })
  })

  // Sin este reset, cambiar el filtro estando en la pagina 5 pide la pagina 5 de
  // un resultado que quiza solo tenga una: la tabla sale vacia sin motivo visible.
  it('vuelve a la pagina 1 al cambiar el rango de fechas', async () => {
    renderWithQuery(<UsersTable />)
    await waitFor(() => expect(mockUsers).toHaveBeenCalled())

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-range'))

    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('1'))
    expect(lastFilter()).toMatchObject({ page: 1 })
  })

  it('cambia el tamano de pagina y vuelve a la pagina 1', async () => {
    renderWithQuery(<UsersTable />)
    await waitFor(() => expect(mockUsers).toHaveBeenCalled())

    await userEvent.click(screen.getByText('go-page-3'))
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('3'))

    await userEvent.click(screen.getByText('set-page-size'))

    await waitFor(() => {
      expect(lastFilter()).toMatchObject({ page: 1, pageSize: 50 })
    })
  })

  it('manda la busqueda como `q` y la omite cuando esta vacia', async () => {
    renderWithQuery(<UsersTable />)
    await waitFor(() => expect(mockUsers).toHaveBeenCalled())
    expect(lastFilter()).toMatchObject({ q: undefined })

    await userEvent.click(screen.getByText('set-search'))

    await waitFor(() => expect(lastFilter()).toMatchObject({ q: 'busqueda' }))
  })
})
