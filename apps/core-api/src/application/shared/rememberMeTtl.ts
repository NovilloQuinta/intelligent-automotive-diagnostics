/**
 * Elige cuanto vive el refresh token segun la casilla "Recordarme" del login.
 *
 * Vive aparte porque la eleccion se traduce a una duracion en tres sitios —el
 * login, el canje del segundo factor y la rotacion del token—, y los tres deben
 * dar la misma respuesta: si uno se desviara, la sesion se acortaria en la
 * primera renovacion sin que nadie viera un error.
 *
 * @param rememberMe - Lo que marco el usuario al dar su contrasena.
 * @param normalTtl - Duracion de una sesion corriente.
 * @param rememberedTtl - Duracion de una sesion recordada. Sin ella no hay
 *   sesiones largas y se cae a `normalTtl`.
 * @returns La duracion aplicable, en la misma unidad que reciba.
 */
export function resolveRefreshTtl(
  rememberMe: boolean,
  normalTtl: number,
  rememberedTtl?: number,
): number {
  if (!rememberMe) return normalTtl
  return rememberedTtl ?? normalTtl
}
