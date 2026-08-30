interface Props {
  readonly message: string | null
}

/** Aviso de fallo al cargar el catálogo de escenarios; no pinta nada sin mensaje. */
export function ScenariosErrorBanner({ message }: Props) {
  if (!message) return null
  return (
    <div className="mb-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
      {message}
    </div>
  )
}
