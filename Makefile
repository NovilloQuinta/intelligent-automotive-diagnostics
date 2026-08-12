.PHONY: build up down logs restart status clean deploy health shell help
.PHONY: prod-deploy prod-up prod-down prod-logs prod-status prod-pull

# ─── Variables ───────────────────────────────────────────────────────────────
COMPOSE := docker compose
COMPOSE_PROD := docker compose -f docker-compose.prod.yml
ENV_FILE := .env
PROD_ENV := .env.production

# ─── Setup ───────────────────────────────────────────────────────────────────
.env:
	@echo "[setup] Creando .env desde .env.production..."
	@cp $(PROD_ENV) $(ENV_FILE)
	@echo "[setup] Edita .env con tus secretos reales antes de hacer deploy"

# ─── Build ───────────────────────────────────────────────────────────────────
build: .env
	$(COMPOSE) --env-file $(ENV_FILE) build

build-no-cache: .env
	$(COMPOSE) --env-file $(ENV_FILE) build --no-cache

# ─── Run ─────────────────────────────────────────────────────────────────────
up: .env
	$(COMPOSE) --env-file $(ENV_FILE) up -d
	@echo "[ok] Servicios: api (4000), ui (8080), emuladores (35000-35002)"

down:
	$(COMPOSE) down

restart: down up

# ─── Deploy ──────────────────────────────────────────────────────────────────
deploy: .env
	@echo "[deploy] Construyendo imagenes..."
	$(COMPOSE) --env-file $(ENV_FILE) build
	@echo "[deploy] Levantando servicios..."
	$(COMPOSE) --env-file $(ENV_FILE) up -d
	@echo "[deploy] Esperando health checks..."
	@sleep 10
	@$(MAKE) status
	@echo ""
	@echo "[deploy] Listo. Verifica:"
	@echo "  API:  curl http://localhost:4000/health"
	@echo "  UI:   curl http://localhost:8080/"
	@echo "  Logs: make logs"

# ─── Logs ────────────────────────────────────────────────────────────────────
logs:
	$(COMPOSE) logs -f --tail=100

logs-api:
	$(COMPOSE) logs -f api

logs-ui:
	$(COMPOSE) logs -f ui

# ─── Status ──────────────────────────────────────────────────────────────────
status:
	$(COMPOSE) ps

health:
	@echo "API health: $$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/health 2>/dev/null || echo 'DOWN')"
	@echo "UI health:  $$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ 2>/dev/null || echo 'DOWN')"

# ─── Cleanup ─────────────────────────────────────────────────────────────────
clean:
	$(COMPOSE) down -v --rmi all 2>/dev/null || true
	@rm -f $(ENV_FILE)
	@echo "[clean] Contenedores, volumenes e imagenes eliminados"

# ─── Utils ───────────────────────────────────────────────────────────────────
shell-api:
	$(COMPOSE) exec api sh

shell-ui:
	$(COMPOSE) exec ui sh

# ─── Production (registry images) ──────────────────────────────────────────
prod-pull:
	@echo "[prod] Pulling images from GHCR..."
	$(COMPOSE_PROD) pull

prod-up: .env
	@echo "[prod] Starting from registry images..."
	$(COMPOSE_PROD) --env-file $(ENV_FILE) up -d --remove-orphans
	@$(MAKE) prod-status

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f --tail=100

prod-status:
	$(COMPOSE_PROD) ps

prod-deploy: .env prod-pull prod-up
	@echo "[prod] Deploy completado."

# ─── Help ────────────────────────────────────────────────────────────────────
help:
	@echo "Intelligent Automotive Diagnostics — Deploy"
	@echo ""
	@echo "  Local (build):"
	@echo "  make deploy       Build + up completo"
	@echo "  make build        Solo buildear imagenes"
	@echo "  make up           Levantar servicios (detached)"
	@echo ""
	@echo "  Production (GHCR images):"
	@echo "  make prod-deploy  Pull + up desde registry"
	@echo "  make prod-pull    Solo pull de imagenes"
	@echo "  make prod-up      Levantar con docker-compose.prod.yml"
	@echo "  make prod-logs    Logs de prod"
	@echo "  make prod-status  Estado de prod"
	@echo ""
	@echo "  Gestion:"
	@echo "  make down         Parar servicios"
	@echo "  make restart      down + up"
	@echo "  make logs         Tail de todos los logs"
	@echo "  make logs-api     Solo logs de API"
	@echo "  make status       Estado de los servicios (docker compose ps)"
	@echo "  make health       Health check rapido"
	@echo "  make clean        Eliminar todo (contenedores, volumenes, imagenes)"
	@echo "  make shell-api    Shell dentro del contenedor api"
	@echo ""
	@echo "Pre-requisitos:"
	@echo "  1. Copia .env.production a .env y rellena los secretos"
	@echo "  2. Copia Caddyfile a /etc/caddy/Caddyfile (ajusta domain)"
	@echo "  3. sudo systemctl reload caddy"
