import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { Severity, SeverityMeta } from './types'
import { COLORS } from './types'

/**
 * Estrecha a `Severity` un valor que llega como `string`.
 *
 * El DTO del backend tipa la severidad como `string`, así que cada pantalla que
 * la pinta necesita este guard. Vive aquí, junto al mapa visual, para que no se
 * vuelva a duplicar con otras claves.
 */
export function isSeverity(value: string): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
}

/** Maps a Severity level to its visual metadata (color, icon, label, background). */
export function severityMeta(sev: Severity): SeverityMeta {
  switch (sev) {
    case 'critical':
      return {
        label: 'CRÍTICO',
        color: COLORS.destructive,
        bg: 'rgba(255,51,51,0.10)',
        border: 'rgba(255,51,51,0.35)',
        icon: ShieldAlert,
      }
    case 'high':
      return {
        label: 'ALTA',
        color: COLORS.destructive,
        bg: 'rgba(255,51,51,0.08)',
        border: 'rgba(255,51,51,0.3)',
        icon: AlertTriangle,
      }
    case 'medium':
      return {
        label: 'MEDIA',
        color: COLORS.warning,
        bg: 'rgba(245,179,1,0.08)',
        border: 'rgba(245,179,1,0.3)',
        icon: AlertTriangle,
      }
    default:
      return {
        label: 'BAJA',
        color: COLORS.accent,
        bg: 'rgba(0,212,170,0.08)',
        border: 'rgba(0,212,170,0.3)',
        icon: CheckCircle2,
      }
  }
}
