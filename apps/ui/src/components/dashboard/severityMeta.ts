import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { Severity, SeverityMeta } from './types'
import { COLORS } from './types'

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
