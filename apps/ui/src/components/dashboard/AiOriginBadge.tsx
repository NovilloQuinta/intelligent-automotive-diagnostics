import { Sparkles } from 'lucide-react'

interface Props {
  /** Que se descubrio, para el tooltip. */
  readonly title: string
}

/**
 * Insignia de lo aprendido por el diagnostico cognitivo.
 *
 * Compartida entre la tabla de PIDs y el mapa de topologia: lo que averigua el
 * agente se marca siempre igual, para que el mecanico distinga de un vistazo lo
 * que dicta la norma de lo que dedujo la IA.
 */
export function AiOriginBadge({ title }: Props) {
  return (
    <span
      className="mono ml-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary"
      title={title}
    >
      <Sparkles className="h-2.5 w-2.5" />
      IA
    </span>
  )
}
