/**
 * HTTP error with status code, thrown by {@link assertOk} so callers can
 * distinguish 404 (missing resource / section unavailable) from other 4xx/5xx
 * errors.
 */
export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiHttpError'
  }
}
