/** Error lanzado cuando el usuario autenticado no existe en el sistema. */
export class UserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'UserNotFoundError'
  }
}
