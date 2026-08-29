import { cn } from '@/lib/utils'

/** Placeholder animado (pulse) mientras carga contenido real. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-primary/10', className)} {...props} />
}

export { Skeleton }
