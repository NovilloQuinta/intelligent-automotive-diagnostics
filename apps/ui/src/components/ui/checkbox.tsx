import * as React from 'react'

import { cn } from '@/lib/utils'

export type CheckboxProps = Omit<React.ComponentProps<'input'>, 'type'>

/**
 * Casilla de verificacion nativa.
 *
 * Nativa a proposito: `accent-color` la pinta con el color de marca y el
 * navegador se encarga del foco, del teclado y de la asociacion con su
 * `<label>` sin una dependencia mas en el bundle.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
