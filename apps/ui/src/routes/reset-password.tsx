import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Car, ShieldAlert } from 'lucide-react'
import { PASSWORD_REGEX, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .max(128)
      .regex(PASSWORD_REGEX, 'Debe incluir 1 mayúscula, 1 número y 1 carácter especial'),
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const newPassword = watch('newPassword') ?? ''

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) return
    try {
      setServerError(null)
      await api.resetPassword(token, data.newPassword)
      toast.success('Contraseña restablecida. Ya puedes iniciar sesión.')
      navigate({ to: '/login' })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Error al restablecer la contraseña')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
      <Card className="w-full max-w-md border-white/10 bg-[#161b22]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Restablecer contraseña</CardTitle>
          <CardDescription>
            Introduce tu nueva contraseña para completar el proceso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">
                El enlace no es válido o le falta el token de recuperación. Solicita uno nuevo.
              </p>
              <Link
                to="/forgot-password"
                className="inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-newPassword">Nueva contraseña</Label>
                <PasswordInput
                  id="reset-newPassword"
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  {...register('newPassword')}
                />
                {errors.newPassword && (
                  <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                )}
                <PasswordStrengthIndicator password={newPassword} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirmPassword">Confirmar contraseña</Label>
                <PasswordInput
                  id="reset-confirmPassword"
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
              {serverError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {serverError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Restableciendo…' : 'Restablecer contraseña'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
