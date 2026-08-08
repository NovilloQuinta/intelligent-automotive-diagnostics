import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { User } from '@/domain/entities/user.js'
import type { AdminUsersFilter } from '@/application/dto/admin/AdminUsersFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'

/**
 * Caso de uso: lista usuarios con el filtro ya validado por el controlador.
 *
 * Vuelve a quitar `passwordHash` de cada fila aunque el repositorio ya deba omitirlo (ver
 * `SqliteUserRepository.list`, que usa `safeUser`): es la ultima linea de defensa antes de
 * que la respuesta llegue al controlador, para que un futuro cambio en el repositorio no
 * pueda filtrar el hash sin que ningun test lo note.
 */
export class ListUsersUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(filter: AdminUsersFilter): Promise<AdminListResult<Omit<User, 'passwordHash'>>> {
    const result = await this.userRepo.list(filter)

    return {
      items: result.items.map((item) => {
        const { passwordHash: _passwordHash, ...safeItem } = item as Omit<User, 'passwordHash'> & {
          passwordHash?: string
        }
        return safeItem
      }),
      total: result.total,
    }
  }
}
