import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TelemetrySnapshot } from "./types";

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
export const LIVE_TELEMETRY_INTERVAL_MS = 1000;

/**
 * Lee los 4 PIDs del dashboard desde {@code GET /api/live-data} una vez por
 * segundo. Sustituye al antiguo generador de jitter en navegador.
 *
 * Degradacion por PID: un valor {@code null} significa lectura fallida en ese
 * sensor; los demas mantienen su valor. El badge {@code LIVE} cae a
 * "Reconectando..." mientras el endpoint no responde.
 */
export function useLiveTelemetry(selectedId: string) {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["live-telemetry", selectedId],
    // Via `api`, no `fetch` directo: el endpoint exige token y `apiFetch` es
    // quien pone la cabecera Authorization y renueva el access token cuando
    // caduca. Con `fetch` a pelo cada lectura respondia 401 y los gauges no
    // llegaban a mostrar un solo valor.
    queryFn: () => api.getLiveData(selectedId),
    enabled: selectedId.length > 0,
    refetchInterval: LIVE_TELEMETRY_INTERVAL_MS,
  });

  if (!selectedId || !data || isLoading) {
    return { live: null, streamOk: false } as const;
  }

  const live: TelemetrySnapshot = {
    rpm: data.rpm ?? 0,
    speed: data.speed ?? 0,
    coolantTemp: data.coolantTemp ?? 0,
    intakeTemp: data.intakeTemp ?? 0,
    rawData: "",
    ts: Date.now(),
  };

  return { live, streamOk: !isError };
}
