import { describe, it, expect } from 'vitest'
import { createWebSearchBudget, MAX_WEB_SEARCHES_PER_SESSION } from '@/infrastructure/mcp/webSearchBudget.js'

describe('createWebSearchBudget', () => {
  it('tryConsume() returns true first 3 times, false from 4th onward', () => {
    const budget = createWebSearchBudget(3)

    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.tryConsume()).toBe(false)
  })

  it('two instances do not share state', () => {
    const budget1 = createWebSearchBudget(3)
    const budget2 = createWebSearchBudget(3)

    budget1.tryConsume()
    budget1.tryConsume()

    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(true)
    expect(budget2.tryConsume()).toBe(false)
  })

  it('default maxCalls is MAX_WEB_SEARCHES_PER_SESSION (3)', () => {
    const budget = createWebSearchBudget()

    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
  })

  it('MAX_WEB_SEARCHES_PER_SESSION is exported and equals 3', () => {
    expect(MAX_WEB_SEARCHES_PER_SESSION).toBe(3)
  })
})
