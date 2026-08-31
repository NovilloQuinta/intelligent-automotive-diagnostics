import { vi } from 'vitest'

/**
 * Setup compartido de los tests de `@/lib/api`.
 *
 * El modulo tiene estado de modulo (`refreshPromise`, para el refresh
 * single-flight), asi que cada test necesita una instancia fresca: de ahi el
 * import dinamico en lugar de uno estatico arriba del fichero.
 */

export const MOCK_TOKENS = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
}

export const MOCK_USER = {
  id: 1,
  username: 'juan',
  email: 'j@b.com',
  userType: 'individual',
  createdAt: '2026-01-01',
  isWorkshop: false,
}

/** Deja tokens validos en localStorage, como si el usuario estuviera logueado. */
export function setStoredTokens() {
  localStorage.setItem('iad.accessToken', MOCK_TOKENS.accessToken)
  localStorage.setItem('iad.refreshToken', MOCK_TOKENS.refreshToken)
}

/**
 * Limpia localStorage y mocks, y devuelve el modulo `api` recien importado.
 *
 * Llamar desde `beforeEach`: sin la re-importacion, el `refreshPromise` de un
 * test se filtra al siguiente y los tests dejan de estar aislados.
 */
export async function freshApiModule() {
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  return await import('../../../src/lib/api')
}
