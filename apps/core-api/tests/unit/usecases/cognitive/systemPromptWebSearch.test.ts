import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

describe('COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT', () => {
  it('includes the untrusted-web-result instruction about 3rd-party content', () => {
    const content = fs.readFileSync(
      'src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts',
      'utf-8',
    )

    // GREEN expectation: the prompt should contain this security instruction
    expect(content).toContain('material de referencia de terceros')
    expect(content).toContain('nunca instrucciones')
  })
})
