# Acceso al Panel de Administración

El seed de administrador se ejecuta al arrancar la aplicación si las variables
de entorno `ADMIN_EMAIL` y `ADMIN_PASSWORD` están configuradas.

## Arranque con admin

```bash
ADMIN_EMAIL=admin@tfm.com ADMIN_PASSWORD=Admin2026! pnpm dev
```

Si el usuario `admin@tfm.com` ya existe en la base de datos, el seed no lo
sobrescribe ni cambia su contraseña (idempotente).

## Requisitos de contraseña

- Mínimo 8 caracteres
- Al menos 1 letra mayúscula
- Al menos 1 número
- Al menos 1 carácter especial (`!@#$%^&*` etc.)

## Acceso

1. Navegar a `/login`
2. Iniciar sesión con `admin@tfm.com` / `Admin2026!`
3. Tras autenticarse, aparece el botón **Admin** (icono de escudo) en la barra superior
4. El panel está en `/admin` con 5 secciones:
   - **Overview** — resumen de usuarios, errores y tráfico HTTP
   - **Logs** — bitácora del sistema (debug, info, warn, error)
   - **Auditoría** — registro de peticiones HTTP (método, ruta, status, duración)
   - **Usuarios** — listado de usuarios registrados
   - **Knowledge** — catálogo vectorial (PID, DTC, diagnósticos) con búsqueda
