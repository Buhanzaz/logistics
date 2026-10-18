#!/usr/bin/env bash
set -euo pipefail

# Logistics — быстрый деплой на VPS / локально
# Использование:
#   chmod +x deploy.sh
#   ./deploy.sh              # локально (http://localhost:5173)
#   ./deploy.sh --vps        # VPS с overlay (http://VPS_IP/logistics-panel/ и http://VPS_IP:5173)
#   ./deploy.sh --help
#
# После завершения скрипт выведет ссылку на вход.

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ---------- цвета ----------
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; CYAN=''; BOLD=''; NC=''
fi
log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }
step() { echo -e "\n${BOLD}==> $*${NC}"; }

USE_VPS_OVERLAY=false
NO_BUILD=false
SKIP_PULL=false

for arg in "$@"; do
  case "$arg" in
    --vps) USE_VPS_OVERLAY=true ;;
    --no-build) NO_BUILD=true ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--vps] [--no-build] [--help]"
      echo "  --vps       использовать docker-compose.vps.yml (нужен для публичного /logistics-panel/ на VPS)"
      echo "  --no-build  не пересобирать образы (только up)"
      exit 0
      ;;
  esac
done

# ---------- проверки окружения ----------
step "Проверка окружения"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker не найден. Установите Docker: https://docs.docker.com/engine/install/"
  exit 1
fi

# docker compose v2 (plugin) или docker-compose (legacy)
COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    err "Не найден 'docker compose' plugin. Обновите Docker."
    exit 1
  fi
fi
log "Docker: $(docker --version)"
log "Compose: $($COMPOSE version 2>&1 | head -n1)"

# ---------- .env ----------
step "Конфигурация .env"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    log "Создан .env из .env.example (дефолтные порты, без токенов — проект без авторизации)"
  else
    warn ".env.example не найден, создаю минимальный .env"
    cat > .env <<'ENV'
FRONTEND_PORT=5173
BACKEND_PORT=8000
POSTGRES_DB=logistics
POSTGRES_USER=logistics
POSTGRES_PASSWORD=logistics
VALHALLA_HOST_PORT=8002
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ENV
  fi
else
  log ".env уже существует — оставляем как есть"
fi

# Показать ключевые порты (source .env безопасно: только простые присваивания)
set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
log "FRONTEND_PORT=$FRONTEND_PORT  BACKEND_PORT=$BACKEND_PORT"

if [ "$USE_VPS_OVERLAY" = true ]; then
  if [ ! -f docker-compose.vps.yml ]; then
    warn "docker-compose.vps.yml не найден — игнорирую --vps"
    USE_VPS_OVERLAY=false
  else
    log "VPS overlay: docker-compose.vps.yml будет подключён"
    # Внешняя сеть для RWMS-моста (если включена интеграция). Для локального стенда не нужна.
    if ! docker network inspect rwms-logistics-private >/dev/null 2>&1; then
      log "Создаю сеть rwms-logistics-private (нужна для VPS overlay)"
      docker network create rwms-logistics-private 2>/dev/null || warn "Не удалось создать сеть rwms-logistics-private — продолжу без неё"
    fi
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.vps.yml"
  fi
else
  COMPOSE_FILES="-f docker-compose.yml"
fi

# ---------- сборка и запуск ----------
step "Запуск контейнеров (может занять 5–30 минут при первой сборке Valhalla)"
if [ "$NO_BUILD" = false ]; then
  log "Собираю образы... (frontend + backend; Valhalla тянется готовым образом)"
  # shellcheck disable=SC2086
  if ! $COMPOSE $COMPOSE_FILES build --parallel 2>&1 | tail -20; then
    err "Сборка образов завершилась с ошибкой. Контейнеры не запускаются; проверьте сообщения выше."
    exit 1
  fi
else
  log "Пропускаю сборку (--no-build)"
fi

log "Поднимаю стек: $COMPOSE $COMPOSE_FILES up -d --pull missing"

# `--pull missing` keeps already-present image tags in Docker's local cache and
# fetches only images that are not available locally. If a pull is interrupted,
# Docker also reuses the layers downloaded by the previous attempt.
# A transient registry/CDN outage can therefore be retried safely. Do not retry
# configuration or application errors.
compose_up_with_retries() {
  local max_attempts=3
  local delay_seconds=5
  local attempt=1
  local output_file
  local compose_status=0

  output_file=$(mktemp "${TMPDIR:-/tmp}/logistics-compose-up.XXXXXX")
  while true; do
    log "Запуск контейнеров (попытка $attempt/$max_attempts)"
    # shellcheck disable=SC2086
    if $COMPOSE $COMPOSE_FILES up -d --pull missing 2>&1 | tee "$output_file"; then
      rm -f "$output_file"
      return 0
    else
      compose_status=$?
    fi

    if ! grep -Eqi '(network is unreachable|no route to host|connection refused|connection reset|connection timed out|i/o timeout|tls handshake timeout|context deadline exceeded|unexpected eof|temporary failure in name resolution|no such host|server misbehaving|could not resolve host|failed to do request: (Get|Head)|too many requests|429 too many requests|503 service unavailable)' "$output_file"; then
      err "Docker Compose не смог запустить контейнеры; подробности приведены выше."
      rm -f "$output_file"
      return "$compose_status"
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      err "Не удалось скачать образы после $max_attempts попыток."
      if grep -Eqi '(network is unreachable|no route to host)' "$output_file"; then
        warn "Похоже, у VPS нет рабочего маршрута к IPv6-адресу registry/CDN. Проверьте IPv6-маршрут или настройте Docker/хост использовать доступный IPv4, затем повторите ./deploy.sh --vps --no-build."
      else
        warn "Проверьте исходящий доступ VPS к Docker Hub/GHCR и повторите ./deploy.sh --vps --no-build. Уже скачанные слои сохраняются."
      fi
      rm -f "$output_file"
      return "$compose_status"
    fi

    warn "Временный сбой при скачивании образов. Повтор через ${delay_seconds} сек.; уже скачанные слои сохраняются."
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
    delay_seconds=$((delay_seconds * 2))
  done
}

compose_up_with_retries

# ---------- ожидание здоровья ----------
step "Ожидание готовности сервисов"
# Ждём backend /api/health и frontend /healthz (внутри сети)
wait_for() {
  local name="$1" url="$2" max="$3"
  echo -n "  $name ($url) "
  for i in $(seq 1 "$max"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      echo -e "${GREEN}OK${NC}"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo -e " ${YELLOW}таймаут${NC} (проверьте $COMPOSE $COMPOSE_FILES logs $name)"
  return 1
}

# Локальные пробросы на 127.0.0.1
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}/api/health"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}/healthz"

# Даём БД и миграциям 10с на старт
sleep 5

# Valhalla — самый тяжёлый (до 30м при первом запуске), не блокируем весь деплой
log "Проверяю backend (миграции Alembic уже внутри) — до 90с"
wait_for "backend" "$BACKEND_URL" 45 || warn "Backend ещё не ответил — смотрите логи: $COMPOSE $COMPOSE_FILES logs backend --tail 80"

log "Проверяю frontend — до 60с"
wait_for "frontend" "$FRONTEND_URL" 30 || warn "Frontend ещё не ответил — смотрите логи: $COMPOSE $COMPOSE_FILES logs frontend --tail 80"

# ---------- определение IP ----------
step "Определение адреса"

detect_ip() {
  # пробуем внешний IP, затем локальный, затем fallback
  local ip=""
  ip=$(curl -fsS --max-time 3 https://ifconfig.me 2>/dev/null || curl -fsS --max-time 3 http://ifconfig.me 2>/dev/null || true)
  if [ -z "$ip" ] || ! echo "$ip" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  if [ -z "$ip" ]; then
    ip="localhost"
  fi
  echo "$ip"
}

VPS_IP=$(detect_ip)
IP_DASH=$(echo "$VPS_IP" | tr '.' '-' 2>/dev/null || echo "$VPS_IP")

# ---------- итог ----------
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ✅ Развертывание завершено${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}  🔗 Вход в систему:${NC}"
echo ""
# Основной локальный вход (всегда работает)
echo -e "   ${CYAN}Локально:${NC}        http://localhost:${FRONTEND_PORT}/"
echo -e "   ${CYAN}Локально (API):${NC}  http://localhost:${BACKEND_PORT}/api/health"
echo ""
# Внешний IP (для VPS)
if [ "$VPS_IP" != "localhost" ] && [ -n "$VPS_IP" ]; then
  echo -e "   ${CYAN}По IP VPS:${NC}      http://${VPS_IP}:${FRONTEND_PORT}/"
  echo -e "                     http://${VPS_IP}:${BACKEND_PORT}/api/health"
  echo ""
  echo -e "   ${CYAN}Через nginx:${NC}   http://${VPS_IP}/logistics-panel/  ${YELLOW}(если подключен deploy/nginx-public-path.conf)${NC}"
  echo -e "                     https://${IP_DASH}.sslip.io/logistics-panel/  ${YELLOW}(пример для 77-90-158-90.sslip.io)${NC}"
else
  echo -e "   ${CYAN}На VPS:${NC}        http://YOUR_VPS_IP:${FRONTEND_PORT}/"
  echo -e "   ${CYAN}Через nginx:${NC}   http://YOUR_VPS_IP/logistics-panel/"
  echo -e "                     https://YOUR_DOMAIN/logistics-panel/"
fi
echo ""
echo -e "   ${YELLOW}Без авторизации${NC} — токены не нужны. Откройте ссылку и сразу работайте."
echo ""
echo -e "${BOLD}Полезные команды:${NC}"
echo "  $COMPOSE $COMPOSE_FILES logs -f backend      # логи бэкенда"
echo "  $COMPOSE $COMPOSE_FILES logs -f frontend     # логи фронта"
echo "  $COMPOSE $COMPOSE_FILES ps                   # статус"
echo "  $COMPOSE $COMPOSE_FILES down                 # остановить"
echo "  curl http://127.0.0.1:${BACKEND_PORT}/api/health   # проверка API"
echo ""
if [ "$USE_VPS_OVERLAY" = false ]; then
  echo -e "${YELLOW}Подсказка:${NC} на прод VPS запустите с флагом --vps чтобы включить /logistics-panel/ префикс:"
  echo "  ./deploy.sh --vps"
  echo ""
fi
echo -e "${GREEN}Готово!${NC} Скопируйте ссылку выше и откройте в браузере."
