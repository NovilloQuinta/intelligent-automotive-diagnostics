import { describe, it, expect } from 'vitest'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'

describe('seedScenarios', () => {
  it('should have ecus in audi-a3-idle scenario', () => {
    const audi = seedScenarios.find((s) => s.id === 'audi-a3-idle')
    expect(audi).toBeDefined()
    expect(audi!.ecus).toBeDefined()
    expect(audi!.ecus!.length).toBeGreaterThanOrEqual(1)
    expect(audi!.ecus![0].name).toBe('Engine Control Unit')
  })

  it('should have ecus in kawa-z900 scenario', () => {
    const kawa = seedScenarios.find((s) => s.id === 'kawa-z900')
    expect(kawa).toBeDefined()
    expect(kawa!.ecus).toBeDefined()
    expect(kawa!.ecus!.length).toBeGreaterThanOrEqual(1)
    expect(kawa!.ecus![0].name).toBe('Engine Control Unit')
  })
})
