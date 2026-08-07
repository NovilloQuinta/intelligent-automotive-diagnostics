import { describe, it, expect } from 'vitest'

// RED phase: these imports will fail because webSearchBudget.ts doesn't exist yet

describe('createWebSearchBudget - RED', () => {
  it('tryConsume() returns true first 3 times, false from 4th onward', async () => {
    const { createWebSearchBudget } = await import('@/infrastructure/mcp/webSearchBudget.js')

    const budget = createWebSearchBudget(3)

    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.tryConsume()).toBe(false)
  })

  it('two instances do not share state', async () => {
    const { createWebSearchBudget } = await import('@/infrastructure/mcp/webSearchBudget.js')

    const budget1 = createWebSearchBudget(3)
    const budget2 = createWebSearchBudget(3)

    budget1.tryConsume()
    budget1.tryConsume()

    // budget2 should still have all 3 available
    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(false)
  })

  it('default maxCalls is MAX_WEB_SEARCHES_PER_SESSION (3)', async () => {
    const { createWebSearchBudget } = await import('@/infrastructure/mcp/webSearchBudget.js')

    const budget = createWebSearchBudget()

    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
  })
})
