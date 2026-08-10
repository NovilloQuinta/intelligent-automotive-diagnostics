import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { computePageWindow, Paginator } from '../../../../src/components/shared/Paginator'

// ---------------------------------------------------------------------------
// computePageWindow (pure function — no DOM needed)
// ---------------------------------------------------------------------------

describe('computePageWindow', () => {
  it('should return all pages or ellipsis when totalPages <= 5', () => {
    expect(computePageWindow(1, 3)).toEqual([1, 2, 3])
    // With siblings=1 at page 2 of 5, page 4 is not in the window
    expect(computePageWindow(2, 5)).toEqual([1, 2, 3, 'ellipsis-end', 5])
  })

  it('should show ellipsis-end when page is near the start', () => {
    // totalPages=10, page=1 or page=2
    const result = computePageWindow(2, 10)
    expect(result).toContain('ellipsis-end')
    expect(result).not.toContain('ellipsis-start')
    // Should contain pages 1,2,3 and last page 10
    expect(result).toEqual([1, 2, 3, 'ellipsis-end', 10])
  })

  it('should show ellipsis-start when page is near the end', () => {
    // totalPages=10, page=9
    const result = computePageWindow(9, 10)
    expect(result).toContain('ellipsis-start')
    expect(result).not.toContain('ellipsis-end')
    expect(result).toEqual([1, 'ellipsis-start', 8, 9, 10])
  })

  it('should show both ellipses when page is in the middle', () => {
    // totalPages=20, page=10
    const result = computePageWindow(10, 20)
    expect(result).toContain('ellipsis-start')
    expect(result).toContain('ellipsis-end')
    expect(result).toEqual([1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20])
  })

  it('should slide the window with the current page', () => {
    // This is the bug fix test: page 7 of 10 should NOT show pages 1-5
    const result = computePageWindow(7, 10)
    // The window should center around page 7: [1, 'ellipsis-start', 6, 7, 8, 'ellipsis-end', 10]
    expect(result).toEqual([1, 'ellipsis-start', 6, 7, 8, 'ellipsis-end', 10])
  })

  it('should handle edge: page 1, total 100', () => {
    const result = computePageWindow(1, 100)
    expect(result).toEqual([1, 2, 'ellipsis-end', 100])
  })

  it('should handle edge: page 100, total 100', () => {
    const result = computePageWindow(100, 100)
    expect(result).toEqual([1, 'ellipsis-start', 99, 100])
  })
})

// ---------------------------------------------------------------------------
// Paginator component
// ---------------------------------------------------------------------------

describe('Paginator', () => {
  const BASE_PROPS = {
    page: 1,
    totalPages: 5,
    total: 50,
    onPageChange: vi.fn(),
  }

  it('should render Anterior and Siguiente buttons', () => {
    render(<Paginator {...BASE_PROPS} />)

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDefined()
  })

  it('should disable Anterior when page is 1', () => {
    render(<Paginator {...BASE_PROPS} page={1} totalPages={10} />)

    const anterior = screen.getByRole('button', { name: /anterior/i })
    expect(anterior).toBeDisabled()
  })

  it('should disable Siguiente when on last page', () => {
    render(<Paginator {...BASE_PROPS} page={5} totalPages={5} />)

    const siguiente = screen.getByRole('button', { name: /siguiente/i })
    expect(siguiente).toBeDisabled()
  })

  it('should call onPageChange when a page button is clicked', () => {
    const onPageChange = vi.fn()
    render(<Paginator {...BASE_PROPS} onPageChange={onPageChange} totalPages={10} />)

    const page2 = screen.getByRole('button', { name: '2' })
    fireEvent.click(page2)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('should call onPageChange with page-1 when Anterior is clicked', () => {
    const onPageChange = vi.fn()
    render(<Paginator {...BASE_PROPS} page={3} totalPages={10} onPageChange={onPageChange} />)

    const anterior = screen.getByRole('button', { name: /anterior/i })
    fireEvent.click(anterior)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('should call onPageChange with page+1 when Siguiente is clicked', () => {
    const onPageChange = vi.fn()
    render(<Paginator {...BASE_PROPS} page={3} totalPages={10} onPageChange={onPageChange} />)

    const siguiente = screen.getByRole('button', { name: /siguiente/i })
    fireEvent.click(siguiente)
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('should show ellipsis markers when totalPages is large', () => {
    render(<Paginator {...BASE_PROPS} page={10} totalPages={20} total={200} />)

    // The ellipsis markers are rendered as <span aria-hidden="true">…</span>
    const ellipses = screen.getAllByText('…')
    expect(ellipses.length).toBe(2) // both ellipsis-start and ellipsis-end
  })

  it('should show total count', () => {
    render(<Paginator {...BASE_PROPS} total={42} />)

    expect(screen.getByText(/42 resultados/)).toBeDefined()
  })

  it('should show singular "resultado" when total is 1', () => {
    render(<Paginator {...BASE_PROPS} total={1} totalPages={1} />)

    expect(screen.getByText('1 resultado')).toBeDefined()
  })
})
