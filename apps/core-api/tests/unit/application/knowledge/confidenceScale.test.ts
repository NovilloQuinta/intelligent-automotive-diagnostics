import { describe, it, expect } from 'vitest'
import {
  initialConfidenceFor,
  validatedConfidenceFor,
  boostConfidence,
  SUCCESSFUL_REUSE_BONUS,
} from '@/application/knowledge/confidenceScale.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

describe('confidenceScale', () => {
  describe('initialConfidenceFor', () => {
    it('asigna la confianza inicial de cada procedencia segun ADR-007 §4', () => {
      expect(initialConfidenceFor(KnowledgeSource.Web)).toBe(0.3)
      expect(initialConfidenceFor(KnowledgeSource.Mechanic)).toBe(0.8)
      expect(initialConfidenceFor(KnowledgeSource.PreviousDiagnosis)).toBe(0.5)
    })

    it('trata lo ya validado contra el vehiculo como la confianza mas alta posible', () => {
      expect(initialConfidenceFor(KnowledgeSource.ObdValidated)).toBe(1)
    })
  })

  describe('validatedConfidenceFor', () => {
    it('sube la confianza de web y mecanico al confirmarse contra el vehiculo', () => {
      expect(validatedConfidenceFor(KnowledgeSource.Web, 0.3)).toBe(0.7)
      expect(validatedConfidenceFor(KnowledgeSource.Mechanic, 0.8)).toBe(0.9)
    })

    it('devuelve la confianza actual sin cambio si la procedencia no define escalado', () => {
      expect(validatedConfidenceFor(KnowledgeSource.ObdValidated, 0.95)).toBe(0.95)
      expect(validatedConfidenceFor(KnowledgeSource.PreviousDiagnosis, 0.9)).toBe(0.9)
    })

    it('nunca baja la confianza: una entrada ya escalada por encima del objetivo se conserva', () => {
      // Un PID de web reutilizado con exito puede superar 0.7 antes de validarse.
      expect(validatedConfidenceFor(KnowledgeSource.Web, 0.9)).toBe(0.9)
    })
  })

  describe('boostConfidence', () => {
    it('suma el bonus indicado', () => {
      expect(boostConfidence(0.5, 0.2)).toBeCloseTo(0.7, 10)
    })

    it('satura en 1 en vez de desbordar el rango', () => {
      expect(boostConfidence(0.9, 0.2)).toBe(1)
      expect(boostConfidence(1, SUCCESSFUL_REUSE_BONUS)).toBe(1)
    })

    it('expone el bonus por reutilizacion exitosa del ADR-007 §4', () => {
      expect(SUCCESSFUL_REUSE_BONUS).toBe(0.2)
    })
  })
})
