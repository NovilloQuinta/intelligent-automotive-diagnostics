import { describe, it, expect } from 'vitest'
import { pathToFileURL } from 'node:url'
import { resolveEnvFilePath } from '@/infrastructure/configuration/envFile.js'

/**
 * El `.env` vive en la raiz del repositorio, que es donde esta `.env.example` y
 * donde la documentacion manda copiarlo. Estuvo resuelto a `apps/.env` y la
 * aplicacion arrancaba con los valores por defecto sin avisar de nada.
 */
describe('resolveEnvFilePath', () => {
  it('should resolve to the repo root when running from src', () => {
    const moduleUrl = pathToFileURL('/repo/apps/core-api/src/main.ts').href

    expect(resolveEnvFilePath(moduleUrl)).toBe('/repo/.env')
  })

  it('should resolve to the repo root when running the build from dist', () => {
    const moduleUrl = pathToFileURL('/repo/apps/core-api/dist/main.js').href

    expect(resolveEnvFilePath(moduleUrl)).toBe('/repo/.env')
  })

  it('should not point inside apps/, which is where the bug left it', () => {
    const moduleUrl = pathToFileURL('/repo/apps/core-api/src/main.ts').href

    expect(resolveEnvFilePath(moduleUrl)).not.toBe('/repo/apps/.env')
  })
})
