import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, MailCheck } from "lucide-react";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Message shown after submission, regardless of whether the email exists,
 * is locked, or the email send failed. Reinforces the backend's
 * anti-enumeration policy: the UI never reveals account existence.
 */
const GENERIC_SUCCESS_MESSAGE =
  "Si el email existe, te hemos enviado un enlace de recuperación.";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      await api.forgotPassword(data.email);
    } catch {
      // Anti-enumeration: the UI always shows the same generic message,
      // regardless of whether the request succeeded or failed.
    } finally {
      setSubmitted(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
      <Card className="w-full max-w-md border-white/10 bg-[#161b22]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            Introduce tu email y te enviaremos un enlace para restablecer tu
            contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                <MailCheck className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                {GENERIC_SUCCESS_MESSAGE}
              </p>
              <Link
                to="/login"
                className="inline-block text-sm text-primary underline-offset-2 hover:underline"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Enviando…" : "Enviar enlace"}
              </Button>
              <div className="text-center">
                <Link
                  to="/login"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  Volver a iniciar sesión
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
