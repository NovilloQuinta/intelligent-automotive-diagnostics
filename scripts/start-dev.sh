#!/usr/bin/env bash
# Carga las variables de entorno del .env raíz y arranca dev:all (que ya
# libera los puertos 4000/5173 vía predev:all).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[start-dev] ERROR: no se encontró ${ENV_FILE}. Crea el .env antes de arrancar." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

echo "[start-dev] Variables de entorno cargadas desde ${ENV_FILE}"
cd "${ROOT_DIR}"
exec pnpm dev:all
