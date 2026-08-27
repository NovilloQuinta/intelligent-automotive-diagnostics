import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiHttpError } from '../../../../src/lib/api-errors'
import type {
  AdminKnowledgeStats,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
} from '../../../../src/components/admin/types'

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
const mockKnowledgeStats = vi.fn()
const mockKnowledgeSearch = vi.fn()

vi.mock('../../../../src/lib/api', () => ({
  api: {
    admin: {
      knowledgeStats: () => mockKnowledgeStats(),
      knowledgeSearch: (input: KnowledgeSearchInput) => mockKnowledgeSearch(input),
    },
  },
}))

import { KnowledgePanel } from '../../../../src/components/admin/KnowledgePanel'

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

function makeStats(overrides?: Partial<AdminKnowledgeStats>): AdminKnowledgeStats {
  return {
    pids: { count: 120, sample: [] },
    dtcs: { count: 350, sample: [] },
    diagnoses: { count: 42, sample: [] },
    ...overrides,
  } as AdminKnowledgeStats
}

function makeSearchResults(): KnowledgeSearchResponse {
  return {
    results: [
      { entry: { code: 'P0301', description: 'Cylinder 1 Misfire' }, distance: 0.05 },
      { entry: { code: 'P0302', description: 'Cylinder 2 Misfire' }, distance: 0.12 },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KnowledgePanel', () => {
  it('shows stats counts for the 3 indexes', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())

    renderWithQuery(<KnowledgePanel />)

    expect(await screen.findByText('120')).toBeDefined()
    expect(screen.getByText('350')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
    // Labels may appear in both cards and select options — use getAllByText
    expect(screen.getAllByText(/pids/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/dtcs/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/diagnoses/i).length).toBeGreaterThan(0)
  })

  it('allows searching and shows results', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())
    mockKnowledgeSearch.mockResolvedValue(makeSearchResults())

    renderWithQuery(<KnowledgePanel />)

    await screen.findByText('120')

    const textInput = screen.getByPlaceholderText(/texto/i)
    fireEvent.change(textInput, { target: { value: 'misfire' } })

    const searchButton = screen.getByRole('button', { name: /buscar/i })
    fireEvent.click(searchButton)

    expect(await screen.findByText(/Cylinder 1 Misfire/)).toBeDefined()
    expect(screen.getByText(/Cylinder 2 Misfire/)).toBeDefined()
    // Distances should appear
    expect(screen.getByText('0.05')).toBeDefined()
    expect(screen.getByText('0.12')).toBeDefined()
  })

  it('shows loading skeleton for stats', () => {
    mockKnowledgeStats.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<KnowledgePanel />)

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows "Catálogo vectorial no disponible" on 503 error', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())
    mockKnowledgeSearch.mockRejectedValue(new ApiHttpError('Service Unavailable', 503))

    renderWithQuery(<KnowledgePanel />)

    await screen.findByText('120')

    const textInput = screen.getByPlaceholderText(/texto/i)
    fireEvent.change(textInput, { target: { value: 'test' } })

    const searchButton = screen.getByRole('button', { name: /buscar/i })
    fireEvent.click(searchButton)

    expect(await screen.findByText(/catálogo vectorial no disponible/i)).toBeDefined()
  })

  // Enter dentro del campo es el atajo que usa cualquiera antes de buscar el boton.
  it('busca al pulsar Enter en el campo de texto', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())
    mockKnowledgeSearch.mockResolvedValue(makeSearchResults())

    renderWithQuery(<KnowledgePanel />)
    await screen.findByText('120')

    const textInput = screen.getByPlaceholderText(/texto/i)
    fireEvent.change(textInput, { target: { value: 'misfire' } })
    fireEvent.keyDown(textInput, { key: 'Enter' })

    expect(await screen.findByText(/Cylinder 1 Misfire/)).toBeDefined()
  })

  it('no busca con cualquier otra tecla', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())
    mockKnowledgeSearch.mockResolvedValue(makeSearchResults())

    renderWithQuery(<KnowledgePanel />)
    await screen.findByText('120')

    const textInput = screen.getByPlaceholderText(/texto/i)
    fireEvent.change(textInput, { target: { value: 'misfire' } })
    fireEvent.keyDown(textInput, { key: 'a' })

    expect(mockKnowledgeSearch).not.toHaveBeenCalled()
  })

  it('busca en el indice elegido en el desplegable', async () => {
    mockKnowledgeStats.mockResolvedValue(makeStats())
    mockKnowledgeSearch.mockResolvedValue(makeSearchResults())

    renderWithQuery(<KnowledgePanel />)
    await screen.findByText('120')

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'DTCs' }))

    fireEvent.change(screen.getByPlaceholderText(/texto/i), { target: { value: 'misfire' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(mockKnowledgeSearch).toHaveBeenCalledWith(expect.objectContaining({ index: 'dtcs' }))
    })
  })
})
