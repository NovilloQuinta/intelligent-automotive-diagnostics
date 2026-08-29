/** Shared building blocks reused by landing page sections. */

export const badgeClass =
  'inline-flex items-center gap-2 rounded-full border border-border bg-foreground/5 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground'

/** Punto de estado "online" verde, puramente decorativo (aria-hidden). */
export function Led() {
  return (
    <span className="led-dot inline-block size-2 rounded-full bg-[var(--success)]" aria-hidden />
  )
}

/** Etiqueta con estilo "badge" para el encabezado de cada sección de la landing. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className={badgeClass}>{children}</span>
}
