import type { TokenPair } from '@/application/dto/auth/TokenPair.js'

/** Sesion abierta: el usuario no tiene segundo factor y ya esta dentro. */
export type LoginTokensOutput = TokenPair & { readonly twoFactorRequired: false }

/**
 * Primer factor superado, falta el segundo.
 *
 * No lleva tokens **a proposito**: mientras no se canjee el reto no hay sesion.
 * `challengeToken` es opaco y de un solo uso; su hash es lo unico que se guarda.
 */
export interface LoginChallengeOutput {
  readonly twoFactorRequired: true
  readonly challengeToken: string
  /** Caducidad del reto en ISO-8601, para que la UI avise antes de que expire. */
  readonly expiresAt: string
}

/**
 * Output del caso de uso LoginUser.
 *
 * Union discriminada por `twoFactorRequired`: obliga a quien lo consume a decidir
 * explicitamente que hace en cada caso, en vez de leer un `accessToken` que puede
 * no estar.
 */
export type LoginUserOutput = LoginTokensOutput | LoginChallengeOutput
