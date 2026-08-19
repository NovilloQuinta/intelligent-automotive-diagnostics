import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Niveles que hay que subir desde el modulo de entrada hasta la raiz del repo.
 *
 * `main.ts` vive en `apps/core-api/src/` y su compilado en `apps/core-api/dist/`,
 * asi que en los dos casos son tres saltos: `src` → `core-api` → `apps` → raiz.
 */
const LEVELS_TO_REPO_ROOT = '../../../'

/**
 * Resuelve la ruta del `.env` del proyecto, que vive en la **raiz del repositorio**.
 *
 * Existe como funcion propia por un fallo que costo una tarde de depuracion: la
 * ruta estaba a dos niveles (`../../.env`), que desde `apps/core-api/src` apunta a
 * `apps/.env`. Pero `.env.example` esta en la raiz y la documentacion manda hacer
 * `cp .env.example .env` alli, asi que **la aplicacion nunca leia el fichero que se
 * le decia al usuario que creara**: arrancaba con los valores por defecto de Zod y
 * en silencio. El sintoma no era un error, era peor — `OBD_TRACE=true` no encendia
 * la traza, y quien depuraba se quedaba sin la herramienta con la que depurar.
 *
 * @param moduleUrl - `import.meta.url` del modulo de entrada.
 * @returns Ruta absoluta al `.env` de la raiz del repositorio.
 */
export function resolveEnvFilePath(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), LEVELS_TO_REPO_ROOT, '.env')
}
