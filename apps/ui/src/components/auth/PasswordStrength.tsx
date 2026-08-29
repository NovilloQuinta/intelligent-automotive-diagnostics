// Shared password strength UI — used by register, reset-password, and
// change-password forms.

/** Password complexity requirement: 1 uppercase, 1 digit, 1 special char. */
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$/

export type StrengthLevel = 'none' | 'weak' | 'medium' | 'strong'

const STRENGTH_META: Record<
  StrengthLevel,
  { label: string; color: string; textColor: string; pct: number }
> = {
  none: { label: 'Sin contraseña', color: 'bg-border', textColor: 'text-muted-foreground', pct: 0 },
  weak: { label: 'Débil', color: 'bg-destructive', textColor: 'text-destructive', pct: 25 },
  medium: { label: 'Moderada', color: 'bg-warning', textColor: 'text-warning', pct: 60 },
  strong: { label: 'Segura', color: 'bg-success', textColor: 'text-success', pct: 100 },
}

/** Scores a password's strength based on length and character variety. */
export function computeStrength(password: string): StrengthLevel {
  if (password.length === 0) return 'none'
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 2) return 'weak'
  if (score <= 4) return 'medium'
  return 'strong'
}

/** Visual strength bar + label for a password field. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const meta = STRENGTH_META[computeStrength(password)]

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {['weak', 'medium', 'strong'].map((level) => {
          const lvl = level as StrengthLevel
          const cmp = STRENGTH_META[lvl]
          const filled = meta.pct >= cmp.pct
          return (
            <div
              key={level}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                filled ? cmp.color : 'bg-white/10'
              }`}
            />
          )
        })}
      </div>
      {password.length > 0 && (
        <p className={`text-xs transition-colors duration-300 ${meta.textColor}`}>{meta.label}</p>
      )}
    </div>
  )
}

/** Password requirement item shown below the password field. */
export function PwdReq({ met, text }: { met: boolean; text: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 text-[11px] transition-colors ${
        met ? 'text-success' : 'text-muted-foreground'
      }`}
    >
      <span className={`text-xs ${met ? 'text-success' : 'text-muted-foreground/50'}`}>
        {met ? '●' : '○'}
      </span>
      {text}
    </li>
  )
}

/** Computes the individual complexity checks used by {@link PwdReq} lists. */
export function computePasswordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  }
}

/**
 * Composite strength meter + requirement checklist. Renders nothing extra
 * for an empty password (the meter still shows an empty state).
 */
export function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = computePasswordChecks(password)

  return (
    <>
      <PasswordStrengthMeter password={password} />
      {password.length > 0 && (
        <ul className="space-y-0.5 pl-0.5">
          <PwdReq met={checks.minLength} text="Mínimo 8 caracteres" />
          <PwdReq met={checks.hasUpper} text="Al menos una mayúscula" />
          <PwdReq met={checks.hasLower} text="Al menos una minúscula" />
          <PwdReq met={checks.hasNumber} text="Al menos un número" />
          <PwdReq met={checks.hasSpecial} text="Al menos un carácter especial" />
        </ul>
      )}
    </>
  )
}
