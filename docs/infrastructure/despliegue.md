# Despliegue

Como llega el codigo a `diag.jcodinglabs.com`, y **como se vuelve atras** cuando
un despliegue sale mal. Lo segundo es la razon de ser de este fichero: hasta el
2026-08-26 no habia marcha atras posible.

## La cadena

```
push a main
   -> CI (.github/workflows/ci.yml)      lint, tests, e2e, cabeceras de nginx
   -> CD (.github/workflows/deploy.yml)  solo si la CI acabo en verde
        -> build de las 3 imagenes -> GHCR, etiquetadas con el SHA y con latest
        -> SSH al VPS: fija IMAGE_TAG, pull, up -d
        -> verificacion: /health, la UI y el dominio publico
```

En el VPS:

| Peticion | Ruta |
|---|---|
| `diag.jcodinglabs.com/api/*` | Caddy (systemd, `/etc/caddy/Caddyfile`) -> `127.0.0.1:4000` -> Express |
| `diag.jcodinglabs.com/*` | Caddy -> `127.0.0.1:8080` -> nginx del contenedor -> `dist/` |

Los contenedores se publican **solo en loopback**, asi que desde fuera del VPS
unicamente responde el 443. Los emuladores ELM327 no se publican en absoluto: la
API los alcanza por el DNS interno de compose (`ELM327_AUDI_HOST=elm327-audi`).

## Que version corre

La fija `IMAGE_TAG` en `/var/www/intelligent-automotive-diagnostics/.env`, que el
despliegue reescribe —**solo esa linea**, el resto del `.env` lleva las claves
reales— con el SHA del commit. `docker-compose.prod.yml` lo lee:

```yaml
image: ghcr.io/novilloquinta/intelligent-automotive-diagnostics/api:${IMAGE_TAG:-latest}
```

Para saber que hay desplegado, por SSH:

```bash
cd /var/www/intelligent-automotive-diagnostics && grep '^IMAGE_TAG=' .env
```

## Volver atras

Dos vias. La primera es la rapida y no necesita a GitHub:

```bash
# En el VPS
cd /var/www/intelligent-automotive-diagnostics
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<SHA_ANTERIOR>/" .env
docker compose -f docker-compose.prod.yml up -d
```

Funciona porque la imagen anterior **sigue en disco**: el despliegue conserva
siete dias (`docker image prune -af --filter "until=168h"`). Antes hacia
`prune -af` a secas, que borraba justo la version a la que habria que volver.

Si la imagen ya no estuviera en local, `docker compose pull` la baja de GHCR,
donde las etiquetas por SHA se quedan indefinidamente.

La segunda via es desde GitHub: **Actions -> CD -> Run workflow**, poniendo el
SHA en `image_tag`. Esa entrada existe para esto — se salta la CI a proposito,
porque cuando hay que revertir no toca volver a pasar tests de un commit que ya
estuvo en produccion.

Los SHA anteriores salen del historial de `main` o de los paquetes en GHCR.

## Que se verifica despues de desplegar

El job no termina en `docker compose ps`, que sale verde aunque un contenedor
este reiniciandose en bucle. Sondea tres cosas durante 60 s y falla si alguna no
responde, volcando los ultimos 50 renglones de log:

- `http://127.0.0.1:4000/health` — la API arranco y conecta con su base.
- `http://127.0.0.1:8080/` — nginx sirve la SPA.
- `https://diag.jcodinglabs.com/` — Caddy y el TLS siguen en pie.

## Comprobaciones manuales tras el primer despliegue

Estas **no** las hace el pipeline y hay que hacerlas una vez, desde una maquina
que no sea el VPS:

```bash
nc -vz <IP_DEL_VPS> 35000        # no debe responder (emulador)
curl -sI http://<IP_DEL_VPS>:4000/health   # no debe responder (API sin Caddy)
curl -sI https://diag.jcodinglabs.com/ | grep -i content-security-policy
```

Las dos primeras confirman que los puertos dejaron de estar en `0.0.0.0`. La
tercera, que la CSP llega al navegador.

## Secretos

`VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY` son secretos del repositorio. El
`GITHUB_TOKEN` del job se usa para el `git fetch` y para `docker login`, pero
**ya no se persiste**: el `origin` del clon en el VPS se deja con la URL sin
credencial. Antes se guardaba con `git remote set-url` incluyendo el token, que
quedaba en claro en `.git/config`.

Las claves de la aplicacion (`LLM_API_KEY`, `ACCESS_TOKEN_SECRET`,
`REFRESH_TOKEN_SECRET`, `TOTP_ENCRYPTION_KEY`, SMTP) viven en el `.env` del VPS
y no pasan por GitHub.
