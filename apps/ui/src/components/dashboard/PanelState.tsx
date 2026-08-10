import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PanelStateProps {
  readonly state: 'loading' | 'empty' | 'error'
  readonly message?: string
}

/**
 * Shared component for rendering loading, empty, or error states in dashboard
 * panels. Avoids duplicating identical markup across multiple panel components.
 */
export function PanelState({ state, message }: PanelStateProps) {
  const isLoading = state === 'loading'
  const isError = state === 'error'

  return (
    <div
      className={cn(
        'flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm',
        isError ? 'text-destructive' : 'text-muted-foreground',
        isLoading && 'gap-2',
      )}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <span>{message}</span>
    </div>
  )
}
