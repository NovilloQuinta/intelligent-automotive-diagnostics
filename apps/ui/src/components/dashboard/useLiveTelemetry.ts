import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TelemetrySnapshot } from './types'

/**
 * Cadencia de polling para la telemetria en vivo.
 *
 * 1 Hz en vez de 2 Hz por una razon de transporte: el ELM327 serializa todos los
 * comandos en una unica conexion TCP con cola FIFO. Cada ciclo son 4 lecturas
 * secuenciales (PIDs 05, 0C, 0D, 0F); contra un adaptador real cada comando
 * cuesta ~50-100 ms, sumando ~200-400 ms por ciclo. A 2 Hz el margen desaparece
 * en cuanto el enlace tiene un mal momento y las peticiones se solapan sobre la
 * misma cola. 1 Hz deja el doble de margen y sigue leyendose como tiempo real.
 */
export const LIVE_TELEMETRY_INTERVAL_MS = 1000

/**
 * Lee los PIDs del dashboard desde {@code GET /api/live-data} una vez por
 * segundo. Sustituye al antiguo generador de jitter en navegador.
 *
 * Acepta un array opcional de PIDs Mode 01 en formato corto (ej. {@code ['0C', '0D']});
 * sin el, el endpoint devuelve los 4 por defecto. El array entra en la
 * query key, de modo que cambiar la seleccion refetchea.
 *
 * Degradacion por PID: un valor {@code null} significa lectura fallida en ese
 * sensor; los demas mantienen su valor. El badge {@code LIVE} cae a
 * "Reconectando..." mientras el endpoint no responde.
 */
export function useLiveTelemetry(selectedId: string, pids?: readonly string[]) {
  const hasPids = pids !== undefined && pids.length > 0
  const { data, isError, isLoading } = useQuery({
    queryKey: ['live-telemetry', selectedId, pids ?? null],
    // Via `api`, no `fetch` directo: el endpoint exige token y `apiFetch` es
    // quien pone la cabecera Authorization y renueva el access token cuando
    // caduca. Con `fetch` a pelo cada lectura respondia 401 y los gauges no
    // llegaban a mostrar un solo valor.
    queryFn: () => (hasPids ? api.getLiveData(selectedId, pids) : api.getLiveData(selectedId)),
    enabled: selectedId.length > 0,
    refetchInterval: LIVE_TELEMETRY_INTERVAL_MS,
    // Sin esto, React Query reintenta cada fallo (3 veces, backoff exponencial)
    // por encima del propio polling de 1 Hz: un 429 o un corte de red puntual
    // se convertia en una rafaga de peticiones que agotaba el rate limit y lo
    // mantenia agotado. El siguiente ciclo del intervalo ya es el reintento.
    retry: false,
    // El poller ya cubre 1 Hz solo: sin esto, volver a la pestaña dispara una
    // peticion extra encima del intervalo, ayudando a agotar el rate limit.
    refetchOnWindowFocus: false,
  })

  if (!selectedId || !data || isLoading) {
    return { live: null, streamOk: false, readings: null } as const
  }

  const live: TelemetrySnapshot = {
    rpm: data.rpm ?? 0,
    speed: data.speed ?? 0,
    coolantTemp: data.coolantTemp ?? 0,
    intakeTemp: data.intakeTemp ?? 0,
    rawData: '',
    ts: Date.now(),
  }

  return { live, streamOk: !isError, readings: data.readings }
}
