#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Intelligent Automotive Diagnostics
# =============================================================================
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh              # Deploy completo (build + up)
#   ./deploy.sh up           # Solo levantar (sin rebuild)
#   ./deploy.sh down         # Parar servicios
#   ./deploy.sh logs         # Ver logs
#   ./deploy.sh status       # Estado de los servicios
#   ./deploy.sh health       # Health check rapido
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
PROD_ENV=".env.production"
COMPOSE="docker compose"
COMPOSE_PROD="docker compose -f docker-compose.prod.yml"
COMPOSE_FILE="docker-compose.prod.yml"

# ─── Colores ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; }

# ─── Setup ───────────────────────────────────────────────────────────────────
setup_env() {
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$PROD_ENV" ]; then
            log "Creando $ENV_FILE desde $PROD_ENV..."
            cp "$PROD_ENV" "$ENV_FILE"
            warn "Edita $ENV_FILE con tus secretos reales (LLM_API_KEY, JWT...)"
        else
            err "No existe $PROD_ENV ni $ENV_FILE. Crea uno primero."
            exit 1
        fi
    fi
}

# ─── Comandos ────────────────────────────────────────────────────────────────
cmd_deploy() {
    setup_env
    log "Construyendo imagenes..."
    $COMPOSE --env-file "$ENV_FILE" build
    log "Levantando servicios..."
    $COMPOSE --env-file "$ENV_FILE" up -d
    log "Esperando health checks..."
    sleep 8
    cmd_status
    echo ""
    log "Deploy completado."
    echo "  API health: curl http://localhost:4000/health"
    echo "  UI:         curl http://localhost:8080/"
    echo "  Logs:       ./deploy.sh logs"
}

cmd_up() {
    setup_env
    log "Levantando servicios..."
    $COMPOSE --env-file "$ENV_FILE" up -d
    cmd_status
}

cmd_down() {
    log "Parando servicios..."
    $COMPOSE down
}

cmd_logs() {
    $COMPOSE logs -f --tail=100
}

cmd_status() {
    $COMPOSE ps
}

cmd_health() {
    echo -n "API (4000): "
    if curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/health 2>/dev/null | grep -q 200; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}DOWN${NC}"
    fi

    echo -n "UI (8080):  "
    if curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/ 2>/dev/null | grep -q 200; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}DOWN${NC}"
    fi
}

cmd_build() {
    setup_env
    log "Construyendo imagenes..."
    $COMPOSE --env-file "$ENV_FILE" build
}

cmd_restart() {
    cmd_down
    cmd_up
}

# ─── Production (registry images) ──────────────────────────────────────────
cmd_prod_deploy() {
    setup_env
    log "Pulling images from GHCR..."
    $COMPOSE_PROD pull
    log "Deploying..."
    $COMPOSE_PROD --env-file "$ENV_FILE" up -d --remove-orphans
    cmd_prod_status
    echo ""
    log "Deploy completado."
}

cmd_prod_up() {
    setup_env
    log "Starting from registry images..."
    $COMPOSE_PROD --env-file "$ENV_FILE" up -d --remove-orphans
    cmd_prod_status
}

cmd_prod_down() {
    log "Stopping production..."
    $COMPOSE_PROD down
}

cmd_prod_pull() {
    log "Pulling images from GHCR..."
    $COMPOSE_PROD pull
}

cmd_prod_logs() {
    $COMPOSE_PROD logs -f --tail=100
}

cmd_prod_status() {
    $COMPOSE_PROD ps
}

# ─── Main ────────────────────────────────────────────────────────────────────
case "${1:-deploy}" in
    deploy)       cmd_deploy ;;
    up)           cmd_up ;;
    down)         cmd_down ;;
    logs)         cmd_logs ;;
    status)       cmd_status ;;
    health)       cmd_health ;;
    build)        cmd_build ;;
    restart)      cmd_restart ;;
    prod-deploy)  cmd_prod_deploy ;;
    prod-up)      cmd_prod_up ;;
    prod-down)    cmd_prod_down ;;
    prod-pull)    cmd_prod_pull ;;
    prod-logs)    cmd_prod_logs ;;
    prod-status)  cmd_prod_status ;;
    *)
        echo "Uso: $0 {deploy|up|down|logs|status|health|build|restart}"
        echo "     $0 {prod-deploy|prod-up|prod-down|prod-pull|prod-logs|prod-status}"
        exit 1
        ;;
esac
