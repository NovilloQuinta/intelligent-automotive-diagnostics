import { describe, it, expect, vi } from 'vitest'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { hashToken } from '@/application/shared/hashToken.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'

function createTokenStore(): RefreshTokenRepository {
  return {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  }
}

describe('LogoutUserUseCase', () => {
  it('should revoke the refresh token using its hash', async () => {
    const tokenStore = createTokenStore()
    const useCase = new LogoutUserUseCase(tokenStore)

    await useCase.execute({ refreshToken: 'refresh-token-abc' })

    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith(hashToken('refresh-token-abc'))
  })

  it('should resolve without error when the token does not exist (idempotent)', async () => {
    const tokenStore = createTokenStore()
    const useCase = new LogoutUserUseCase(tokenStore)

    await expect(useCase.execute({ refreshToken: 'unknown-token' })).resolves.toBeUndefined()
    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledTimes(1)
  })

  it('should throw when refreshToken is missing', async () => {
    const useCase = new LogoutUserUseCase(createTokenStore())

    await expect(useCase.execute({} as { refreshToken: string })).rejects.toThrow()
  })
})
