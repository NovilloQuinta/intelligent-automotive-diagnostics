# Mapa del VPS — Intelligent Automotive Diagnostics

> Vista única del VPS OVH donde corre la app en producción. Actualizado: 2026-08-12.

---

## 1. Datos del servidor

| Campo | Valor |
|---|---|
| Proveedor | OVH |
| IPv4 | `145.239.77.72` |
| Hostname | `vps-863fa654` |
| SO | Ubuntu (kernel 7.0.0-29-generic) |
| Usuario SSH | `ubuntu` (clave: `~/.ssh/id_ed25519` en la máquina de dev) |
| Disco | 72 GB (37% usado) |
| RAM | 7.6 GB |

**Acceso desde tu máquina:**
```bash
ssh ubuntu@145.239.77.72
```

---

## 2. Dominios y DNS (IONOS)

| Dominio | Registro A | Sirve |
|---|---|---|
| `jcodinglabs.com` / `.es` | `145.239.77.72` | Landing (proyecto aparte `Landing-jcodinglabs`) |
| `diag.jcodinglabs.com` | `145.239.77.72` | **Esta app** (diag) |

> `diag.jcodinglabs.com` era un subdominio de hosting IONOS (A+AAAA+MX+SPF); se borró y se puso registro A suelto. El certificado Let's Encrypt lo emite Caddy automáticamente.

---

## 3. Estructura de directorios

| Ruta | Qué es |
|---|---|
| `/opt/intelligent-automotive-diagnostics` | **Código de producción** (clon git, rama `main`). Aquí se hace `docker compose` y vive el `.env` de prod. |
| `/home/ubuntu/projects/intelligent-automotive-diagnostics` | Copia de desarrollo en el VPS (rama `develop`). |
| `/home/ubuntu/projects/Landing-jcodinglabs` | Proyecto del landing (desarrollo). |
| `/var/www/jcodinglabs` | Landing en producción (pm2 + Node :4321). |
| `/etc/caddy/Caddyfile` | Config de Caddy (reverse proxy + certs). |
| `/var/lib/docker/volumes/intelligent-automotive-diagnostics_api-data/_data` | **Datos persistentes** (SQLite + LanceDB). |

---

## 4. Docker — contenedores e imágenes

**Imágenes (GHCR):**
```
ghcr.io/novilloquinta/intelligent-automotive-diagnostics/api:latest     (3.5 GB)
ghcr.io/novilloquinta/intelligent-automotive-diagnostics/ui:latest      (94 MB)
ghcr.io/novilloquinta/intelligent-automotive-diagnostics/elm327:latest  (239 MB)
```

**Contenedores (proyecto compose `intelligent-automotive-diagnostics`):**

| Servicio | Puerto interno | Puerto host | Imagen |
|---|---|---|---|
| `api` | 4000 | 4000 | api |
| `ui` | 80 (nginx) | 8080 | ui |
| `elm327-audi` | 35000 | 35000 | elm327 (run_audi.py) |
| `elm327-kawasaki` | 35001 | 35001 | elm327 (run_kawasaki.py) |
| `elm327-toyota` | 35002 | 35002 | elm327 (run_toyota.py) |

**Volumen:** `intelligent-automotive-diagnostics_api-data` → montado en `/app/data` del contenedor api.

**Residuos que hay que limpiar (de pruebas anteriores):**
- Contenedor `odo-ai-agent-elm327-toyota-1` (estado `Created`, muerto).
- Imagen `odo-ai-agent-elm327-toyota:latest`.

---

## 5. Caddy (reverse proxy + HTTPS)

Config en `/etc/caddy/Caddyfile`. Dos bloques:

1. **Landing** (`jcodinglabs.com`, `.es`, `www.*`) → Node :4321.
2. **Esta app** (`diag.jcodinglabs.com`):
   - `handle /api/*` → `localhost:4000` (api)
   - `handle /api-docs*` → `localhost:4000` (swagger JSON)
   - `handle` → `localhost:8080` (UI nginx)

> ⚠️ **OJO**: usar `handle` (conserva el prefijo `/api`), NUNCA `handle_path` (lo recorta y rompe `/api/auth/*` con 401).

Recargar Caddy tras tocar el fichero:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## 6. Variables de entorno (`.env` de producción)

Archivo: `/opt/intelligent-automotive-diagnostics/.env` (no se commitea; se copió del dev copy).

Claves configuradas (valores ocultos):

| Variable | Para qué |
|---|---|
| `OBD_MODE` | `docker` (emuladores) / `serial` / `tcp` |
| `LLM_PROVIDER/API_KEY/BASE_URL/MODEL` | IA (DeepSeek) |
| `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` | Firmar JWTs |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | Caducidad (segundos) |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Email recuperación (IONOS) |
| `APP_BASE_URL` / `ALLOWED_ORIGINS` | `https://diag.jcodinglabs.com` |
| `PORT` / `DB_PATH` / `LANCEDB_PATH` | Internos |

---

## 7. Base de datos (SQLite)

- Ruta: `/var/lib/docker/volumes/intelligent-automotive-diagnostics_api-data/_data/diagnostics.db`
- Motor: SQLite + Drizzle ORM (migraciones en `apps/core-api/drizzle/`).
- WAL mode → el fichero `.db-wal` puede contener datos sin checkpoint.
- Propiedad `root` (el contenedor corre como root) → consultar con `sudo`.

**Consultar:**
```bash
ssh ubuntu@145.239.77.72
sudo sqlite3 /var/lib/docker/volumes/intelligent-automotive-diagnostics_api-data/_data/diagnostics.db
```
```sql
.tables
SELECT * FROM users;
SELECT * FROM audit_logs ORDER BY id DESC LIMIT 20;
SELECT * FROM refresh_tokens;
```

Tablas: `users`, `refresh_tokens`, `password_reset_tokens`, `vehicles`, `ecus`, `pid_definitions`, `pid_readings`, `dtc_definitions`, `diagnosis_sessions`, `audit_logs`, `logs`, `__drizzle_migrations`.

---

## 8. CI/CD (GitHub Actions)

- Repo: `NovilloQuinta/intelligent-automotive-diagnostics` (privado).
- `.github/workflows/ci.yml` — lint/format/test/build/audit en `main` y PRs.
- `.github/workflows/deploy.yml` — **CD**: en push a `main` builda las 3 imágenes a GHCR y despliega por SSH al VPS.

**Secrets de GitHub (repo):**
| Secret | Valor |
|---|---|
| `VPS_HOST` | `145.239.77.72` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | clave privada `id_ed25519` (comment `github-actions-deploy`) |

> Para pushear `.github/workflows/*` hace falta el scope `workflow` del token (`gh auth refresh -s workflow`).

---

## 9. Operación diaria

**Levantar la app:**
```bash
ssh ubuntu@145.239.77.72
cd /opt/intelligent-automotive-diagnostics
docker compose -f docker-compose.prod.yml up -d
```

**Apagar la app:**
```bash
cd /opt/intelligent-automotive-diagnostics
docker compose -f docker-compose.prod.yml down
```

**Ver estado / logs:**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

**Health checks:**
```bash
curl http://localhost:4000/health          # api
curl http://localhost:8080/                # ui
curl -H "Host: diag.jcodinglabs.com" http://localhost/api/health   # vía Caddy
```

**Deploy manual (sin CI):**
```bash
cd /opt/intelligent-automotive-diagnostics
git pull origin main
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

## 10. Gotchas / decisiones importantes

1. **`handle` vs `handle_path`** en Caddy: `handle_path` recorta `/api` y rompía el registro/login (401). Usar `handle`.
2. **GHCR exige minúsculas** en el nombre de imagen (repo privado `NovilloQuinta` → `novilloquinta`).
3. **`node:22-slim`** en el api (no alpine) por prebuilds nativos de better-sqlite3/lancedb. Healthcheck con `node fetch`, no `wget`.
4. **Emuladores ELM327 no se healthcheckean** (REPL interactivo); `depends_on: service_started`.
5. **`tsc-alias`** reescribe el alias `@/*` en el build; sin él `node dist/main.js` falla.
6. **Migraciones drizzle** deben copiarse al contenedor (`apps/core-api/drizzle` → `/app/drizzle`).
7. **Agentes paralelos**: hay varios procesos `opencode` trabajando en el mismo repo; la rama cambia sola. Verificar `git branch --show-current` antes de commitear.
8. **JWT secrets** se regeneraron (estaban en `changeme`); cambiarlos invalida tokens/refresh existentes.
