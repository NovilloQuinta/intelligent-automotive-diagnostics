import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/** Label con asterisco rojo para campos obligatorios. */
export function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      <span className="ml-0.5 text-destructive" aria-hidden="true">
        *
      </span>
    </Label>
  )
}
