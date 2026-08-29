import { useState } from 'react'
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { AuthUser } from '@/components/dashboard/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from 'lucide-react'
import { PASSWORD_REGEX, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'
import { Header } from '@/components/layout/Header'
import { FooterSection } from '@/components/landing/FooterSection'

const profileDataSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres').max(50),
  address: z.string().max(500).optional(),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
})

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
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

type ProfileDataFormData = z.infer<typeof profileDataSchema>
type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

// Page — auth gating (mirrors DashboardPage's in-component pattern)

function ProfilePage() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  if (auth.status === 'anonymous' || !auth.user) {
    return <Navigate to="/login" replace />
  }

  return <ProfileContent user={auth.user} onRefreshUser={auth.refreshUser} onLogout={auth.logout} />
}

// Content — mounted only once the user is known

function ProfileContent({
  user,
  onRefreshUser,
  onLogout,
}: {
  user: AuthUser
  onRefreshUser: () => Promise<void>
  onLogout: () => Promise<void>
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0d1117]">
      <Header />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-lg border-white/10 bg-[#161b22]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Mi perfil</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="data">
              <TabsList className="mb-6 grid w-full grid-cols-3">
                <TabsTrigger value="data">Datos</TabsTrigger>
                <TabsTrigger value="password">Contraseña</TabsTrigger>
                <TabsTrigger value="security">Seguridad</TabsTrigger>
              </TabsList>

              <TabsContent value="data">
                <ProfileDataForm user={user} onRefreshUser={onRefreshUser} />
              </TabsContent>

              <TabsContent value="password">
                <ChangePasswordForm onLogout={onLogout} />
              </TabsContent>

              <TabsContent value="security">
                <TwoFactorSection user={user} onRefreshUser={onRefreshUser} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <FooterSection />
    </div>
  )
}

function ProfileDataForm({
  user,
  onRefreshUser,
}: {
  user: AuthUser
  onRefreshUser: () => Promise<void>
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileDataFormData>({
    resolver: zodResolver(profileDataSchema),
    defaultValues: {
      username: user.username,
      address: user.address ?? '',
      businessName: user.businessName ?? '',
      taxId: user.taxId ?? '',
    },
  })

  const onSubmit = async (data: ProfileDataFormData) => {
    try {
      setServerError(null)
      await api.updateProfile(data)
      await onRefreshUser()
      toast.success('Perfil actualizado correctamente.')
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Error al actualizar el perfil')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-username">Usuario</Label>
        <Input id="profile-username" autoComplete="username" {...register('username')} />
        {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-address">Dirección</Label>
        <Input id="profile-address" placeholder="C/ Mayor 1, Madrid" {...register('address')} />
      </div>
      {user.isWorkshop && (
        <>
          <div className="space-y-2">
            <Label htmlFor="profile-businessName">Nombre del taller</Label>
            <Input
              id="profile-businessName"
              placeholder="Talleres AutoPro S.L."
              {...register('businessName')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-taxId">CIF / NIF</Label>
            <Input id="profile-taxId" placeholder="B12345678" {...register('taxId')} />
          </div>
        </>
      )}
      {serverError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </form>
  )
}

function ChangePasswordForm({ onLogout }: { onLogout: () => Promise<void> }) {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  })

  const newPassword = watch('newPassword') ?? ''

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      setServerError(null)
      await api.changePassword(data.currentPassword, data.newPassword)
      reset()
      toast.success('Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.')
      // The server revokes all refresh tokens on a successful change — the
      // current session is treated as invalidated on the client too.
      await onLogout()
      navigate({ to: '/login', replace: true })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Error al cambiar la contraseña')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-currentPassword">Contraseña actual</Label>
        <PasswordInput
          id="profile-currentPassword"
          autoComplete="current-password"
          {...register('currentPassword')}
        />
        {errors.currentPassword && (
          <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-newPassword">Nueva contraseña</Label>
        <PasswordInput
          id="profile-newPassword"
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
        <Label htmlFor="profile-confirmPassword">Confirmar nueva contraseña</Label>
        <PasswordInput
          id="profile-confirmPassword"
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
        {isSubmitting ? 'Cambiando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  )
}

/** Paso del alta del segundo factor que se esta mostrando. */
type TwoFactorStep =
  | { name: 'idle' }
  | { name: 'scanning'; qrDataUri: string; secret: string }
  | { name: 'activated'; recoveryCodes: string[] }

/**
 * Alta, consulta y baja del segundo factor.
 *
 * El alta va en dos pasos (`scanning` -> `activated`) porque el backend tampoco
 * enciende nada hasta recibir un codigo valido: si se activara al generar el
 * secreto, un QR mal escaneado dejaria al usuario fuera de su propia cuenta.
 */
function TwoFactorSection({
  user,
  onRefreshUser,
}: {
  user: AuthUser
  onRefreshUser: () => Promise<void>
}) {
  const [step, setStep] = useState<TwoFactorStep>({ name: 'idle' })
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Ejecuta una accion mostrando su error en la propia seccion. */
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ha ocurrido un problema')
    } finally {
      setBusy(false)
    }
  }

  const startSetup = () =>
    run(async () => {
      const setup = await api.setupTwoFactor()
      setStep({ name: 'scanning', qrDataUri: setup.qrDataUri, secret: setup.secret })
    })

  const confirmSetup = () =>
    run(async () => {
      const { recoveryCodes } = await api.activateTwoFactor(code)
      setCode('')
      // Se descarta el QR del estado: el secreto viaja en claro al navegador por
      // necesidad, pero no tiene por que quedarse ahi despues.
      setStep({ name: 'activated', recoveryCodes })
      await onRefreshUser()
    })

  const disable = () =>
    run(async () => {
      await api.disableTwoFactor({ password, code })
      setPassword('')
      setCode('')
      setStep({ name: 'idle' })
      toast.success('Segundo factor desactivado')
      await onRefreshUser()
    })

  if (step.name === 'activated') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Guarda estos códigos de recuperación en un sitio seguro:{' '}
          <strong>no volverán a mostrarse</strong>. Cada uno sirve una sola vez, y son tu única
          forma de entrar si pierdes el móvil.
        </div>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
          {step.recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode} className="rounded border border-white/10 px-2 py-1 text-center">
              {recoveryCode}
            </li>
          ))}
        </ul>
        <Button variant="outline" className="w-full" onClick={() => setStep({ name: 'idle' })}>
          Ya los he guardado
        </Button>
      </div>
    )
  }

  if (step.name === 'scanning') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Escanea el código con tu aplicación de autenticación y confirma con el código que te
          muestre.
        </p>
        <img
          src={step.qrDataUri}
          alt="Código QR del segundo factor"
          className="mx-auto h-48 w-48"
        />
        <p className="text-center text-xs text-muted-foreground">
          ¿No puedes escanear? Introduce esta clave a mano:
          <br />
          <span className="font-mono text-sm text-foreground">{step.secret}</span>
        </p>
        <div className="space-y-2">
          <Label htmlFor="profile-2fa-code">Código de verificación</Label>
          <Input
            id="profile-2fa-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={confirmSetup} disabled={busy || code.trim() === ''}>
          {busy ? 'Confirmando…' : 'Confirmar'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep({ name: 'idle' })}>
          Cancelar
        </Button>
      </div>
    )
  }

  if (user.twoFactorEnabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          El segundo factor está <strong>activo</strong>. Para desactivarlo hacen falta tu
          contraseña y un código vigente: con la sesión iniciada no basta, porque es justo lo que el
          segundo factor protege.
        </p>
        <div className="space-y-2">
          <Label htmlFor="profile-2fa-password">Contraseña</Label>
          <PasswordInput
            id="profile-2fa-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-2fa-disable-code">Código de verificación</Label>
          <Input
            id="profile-2fa-disable-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          variant="destructive"
          className="w-full"
          onClick={disable}
          disabled={busy || password === '' || code.trim() === ''}
        >
          {busy ? 'Desactivando…' : 'Desactivar'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Añade un segundo factor para que tu contraseña no sea lo único que protege la cuenta.
        Necesitarás una aplicación de autenticación en el móvil.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={startSetup} disabled={busy}>
        {busy ? 'Preparando…' : 'Activar'}
      </Button>
    </div>
  )
}
