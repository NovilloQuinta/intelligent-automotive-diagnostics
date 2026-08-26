import { useState } from 'react'
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Car, Wrench } from 'lucide-react'
import { PASSWORD_REGEX, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength'
import { RequiredLabel } from '@/components/auth/RequiredLabel'
import { Header } from '@/components/layout/Header'
import { FooterSection } from '@/components/landing/FooterSection'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

const registerSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres').max(50),
  email: z.string().email('Email inválido').max(255),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128)
    .regex(PASSWORD_REGEX, 'Debe incluir 1 mayúscula, 1 número y 1 carácter especial'),
  userType: z.enum(['individual', 'workshop']),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
})

type LoginFormData = z.infer<typeof loginSchema>
type RegisterFormData = z.infer<typeof registerSchema>

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/login')({
  component: AuthPage,
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AuthPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [serverError, setServerError] = useState<string | null>(null)
  /**
   * Reto pendiente del segundo factor. Mientras exista, la tarjeta muestra el
   * paso del codigo en vez de las pestañas: el usuario ya dio su contrasena y
   * volver a enseñarsela solo invita a repetirla.
   */
  const [challengeToken, setChallengeToken] = useState<string | null>(null)

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  if (auth.status === 'authed') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1117]">
      <Header showAuthActions={false} />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md border-white/10 bg-[#161b22]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Intelligent Automotive Diagnostics</CardTitle>
            <CardDescription>Conecta al sistema de diagnóstico OBD-II</CardDescription>
          </CardHeader>
          <CardContent>
            {challengeToken ? (
              <TwoFactorForm
                serverError={serverError}
                onBack={() => {
                  setChallengeToken(null)
                  setServerError(null)
                }}
                onSubmit={async (code) => {
                  try {
                    setServerError(null)
                    await auth.verifyTwoFactor(challengeToken, code)
                    navigate({ to: '/', replace: true })
                  } catch (e) {
                    // El reto sigue vivo: se deja el paso abierto para reintentar
                    // sin obligar a repetir email y contrasena.
                    setServerError(e instanceof Error ? e.message : 'Código incorrecto')
                  }
                }}
              />
            ) : (
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as 'login' | 'register')
                  setServerError(null)
                }}
              >
                <TabsList className="mb-6 grid w-full grid-cols-2">
                  <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                  <TabsTrigger value="register">Registrarse</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <LoginForm
                    onSubmit={async (data) => {
                      try {
                        setServerError(null)
                        const result = await auth.login(data)
                        if (result.kind === 'twoFactorRequired') {
                          setChallengeToken(result.challengeToken)
                          return
                        }
                        navigate({ to: '/', replace: true })
                      } catch (e) {
                        setServerError(e instanceof Error ? e.message : 'Error al iniciar sesión')
                      }
                    }}
                    serverError={serverError}
                  />
                </TabsContent>

                <TabsContent value="register">
                  <RegisterForm
                    onSubmit={async (data) => {
                      try {
                        setServerError(null)
                        await auth.register(data)
                        navigate({ to: '/', replace: true })
                      } catch (e) {
                        setServerError(e instanceof Error ? e.message : 'Error al registrarse')
                      }
                    }}
                    serverError={serverError}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
      <FooterSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Two-factor step
// ---------------------------------------------------------------------------

/**
 * Segundo paso del inicio de sesion.
 *
 * Un unico campo para las dos clases de codigo: el backend distingue el TOTP del
 * de recuperacion por su forma, asi que pedirle al usuario que elija cual esta
 * metiendo seria trabajo suyo para nada.
 */
function TwoFactorForm({
  onSubmit,
  onBack,
  serverError,
}: {
  onSubmit: (code: string) => Promise<void>
  onBack: () => void
  serverError: string | null
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setSubmitting(true)
        try {
          await onSubmit(code)
        } finally {
          setSubmitting(false)
        }
      }}
    >
      <div className="space-y-2">
        <RequiredLabel htmlFor="login-2fa-code">Código de verificación</RequiredLabel>
        <Input
          id="login-2fa-code"
          // `one-time-code` deja que el llavero del movil ofrezca el codigo.
          autoComplete="one-time-code"
          inputMode="numeric"
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Introduce el código de tu aplicación de autenticación, o uno de tus códigos de
          recuperación.
        </p>
      </div>
      {serverError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={submitting || code.trim() === ''}>
        {submitting ? 'Verificando…' : 'Verificar'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        Volver
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({
  onSubmit,
  serverError,
}: {
  onSubmit: (data: LoginFormData) => Promise<void>
  serverError: string | null
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <RequiredLabel htmlFor="login-email">Email</RequiredLabel>
        <Input
          id="login-email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="login-password">Contraseña</RequiredLabel>
        <PasswordInput
          id="login-password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>
      {serverError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Autenticando…' : 'Iniciar sesión'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Register form
// ---------------------------------------------------------------------------

function RegisterForm({
  onSubmit,
  serverError,
}: {
  onSubmit: (data: RegisterFormData) => Promise<void>
  serverError: string | null
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { userType: 'individual' },
  })

  const userType = watch('userType')
  const password = watch('password') ?? ''

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <RequiredLabel htmlFor="reg-username">Usuario</RequiredLabel>
        <Input
          id="reg-username"
          placeholder="usuario123"
          autoComplete="username"
          {...register('username')}
        />
        {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
        <p className="text-[11px] text-muted-foreground">Entre 3 y 50 caracteres</p>
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="reg-email">Email</RequiredLabel>
        <Input
          id="reg-email"
          type="email"
          placeholder="tu@email.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="reg-password">Contraseña</RequiredLabel>
        <PasswordInput
          id="reg-password"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        <PasswordStrengthIndicator password={password} />
      </div>
      <div className="space-y-2">
        <RequiredLabel htmlFor="reg-userType">Tipo de usuario</RequiredLabel>
        <Select
          value={userType}
          onValueChange={(v) =>
            setValue('userType', v as 'individual' | 'workshop', {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="reg-userType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">
              <span className="flex items-center gap-2">
                <Car className="h-3.5 w-3.5" /> Particular
              </span>
            </SelectItem>
            <SelectItem value="workshop">
              <span className="flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5" /> Taller
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {errors.userType && <p className="text-xs text-destructive">{errors.userType.message}</p>}
      </div>
      {userType === 'workshop' && (
        <>
          <div className="space-y-2">
            <RequiredLabel htmlFor="reg-businessName">Nombre del taller</RequiredLabel>
            <Input
              id="reg-businessName"
              placeholder="Talleres AutoPro S.L."
              {...register('businessName')}
            />
          </div>
          <div className="space-y-2">
            <RequiredLabel htmlFor="reg-taxId">CIF / NIF</RequiredLabel>
            <Input id="reg-taxId" placeholder="B12345678" {...register('taxId')} />
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="reg-address">Dirección</Label>
        <Input id="reg-address" placeholder="C/ Mayor 1, Madrid" {...register('address')} />
      </div>
      {serverError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
    </form>
  )
}
