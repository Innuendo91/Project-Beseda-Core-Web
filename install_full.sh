#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  Stream.ShadeCraft.ru — Installer
#  Генерирует секреты, создаёт .env, настраивает MediaMTX
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[install]${NC} $*"; }
ok()    { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# --- Установка nginx ---
info "Установка nginx..."
apt install nginx -y
ok "nginx установлен"

# --- Установка certbot + certbot-nginx ---
info "Установка certbot и плагина для nginx..."
apt install certbot python3-certbot-nginx -y
ok "certbot установлен"

# --- Установка Docker CE ---
info "Установка Docker CE..."
apt update && apt install -y ca-certificates curl && apt remove -y docker.io docker-doc docker-compose podman-docker containerd runc && mkdir -p /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && chmod a+r /etc/apt/keyrings/docker.asc && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list && apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && systemctl start docker && systemctl enable docker && docker run hello-world
ok "Docker CE установлен"

# --- Определяем корневую директорию проекта ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Ввод домена ---
echo
info "Введите домен сайта (без http/https, без порта)"
info "Пример: stream.shadecraft.ru"
read -rp "  Домен: " DOMAIN
[[ -z "$DOMAIN" ]] && fail "Домен не может быть пустым."

# --- Создание конфига nginx ---
info "Создание конфига nginx для ${DOMAIN}..."
CLEANED="${DOMAIN//[^.]}"
if [[ ${#CLEANED} -ge 2 ]]; then
  SERVER_NAME="${DOMAIN}"
  CERTBOT_DOMAINS="${DOMAIN}"
  HTTP_HOST_CHECK="if (\$host = ${DOMAIN}) { return 301 https://\$host\$request_uri; } # managed by Certbot"
else
  SERVER_NAME="${DOMAIN} www.${DOMAIN}"
  CERTBOT_DOMAINS="${DOMAIN} www.${DOMAIN}"
  HTTP_HOST_CHECK="if (\$host = ${DOMAIN}) { return 301 https://\$host\$request_uri; } # managed by Certbot
    if (\$host = www.${DOMAIN}) { return 301 https://\$host\$request_uri; } # managed by Certbot"
fi
cat > /etc/nginx/sites-available/${DOMAIN} <<EOF
server {
    server_name ${SERVER_NAME};

#    location / {
#        return 301 https://\$host\$request_uri;
#    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

    location / {
        proxy_pass http://127.0.0.1:8085;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Cookie \$http_cookie;
    }

    # WebSocket (чат)
    location /ws/ {
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header Cookie \$http_cookie;
    }

    # voice server
    location /voice/ {
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

server {
    ${HTTP_HOST_CHECK}

    listen 80;
    server_name ${SERVER_NAME};
    return 404; # managed by Certbot
}
EOF
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}

echo
info "В файле /etc/nginx/sites-enabled/default может быть конфиг по умолчанию."
echo -ne "${CYAN}Удалить дефолтный конфиг nginx? (Y/n): ${NC}"
read -r REMOVE_DEFAULT
if [[ -z "$REMOVE_DEFAULT" || "$REMOVE_DEFAULT" =~ ^[Yy]$ ]]; then
  rm -f /etc/nginx/sites-enabled/default
  info "Дефолтный конфиг удалён"
else
  info "Дефолтный конфиг оставлен"
fi

nginx -t && systemctl restart nginx
ok "Конфиг nginx создан и активирован"

# --- Ввод публичного IP (для WebRTC и SRT) ---
echo
info "Введите публичный IP сервера (для WebRTC ICE и SRT)"
info "Оставьте пустым для автоопределения..."
read -rp "  Публичный IP: " PUBLIC_IP
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
  if [[ -z "$PUBLIC_IP" ]]; then
    warn "Не удалось определить IP автоматически."
    read -rp "  Введите IP вручную: " PUBLIC_IP
  fi
fi
[[ -z "$PUBLIC_IP" ]] && fail "Публичный IP не может быть пустым."

ok "Домен: $DOMAIN  |  IP: $PUBLIC_IP"

# --- Генерация секретов ---
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_hex($1))"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"
  else
    # Fallback: /dev/urandom
    head -c "$1" /dev/urandom | xxd -p | tr -d '\n'
  fi
}

echo
info "Генерация секретов..."

DB_PASS=$(generate_secret 16)
SESSION_SECRET=$(generate_secret 32)
VOICE_JWT_SECRET=$(generate_secret 32)
MEDIAMTX_API_PASS=$(generate_secret 24)
WHEP_JWT_SECRET=$(generate_secret 32)
REGISTRATION_CODE=$(generate_secret 8)
SRT_PASSPHRASE=$(generate_secret 20)
VOICE_SERVER_SECRET=$(generate_secret 32)

ok "Секреты сгенерированы"

# --- Создание администратора ---
echo
info "Создание аккаунта администратора..."
read -rp "  Логин админа: " ADMIN_USER
[[ -z "$ADMIN_USER" ]] && fail "Логин не может быть пустым."

read -rp "  Пароль админа: " ADMIN_PASS_INPUT
if [[ -z "$ADMIN_PASS_INPUT" ]]; then
  ADMIN_PASS_INPUT=$(generate_secret 12)
  warn "Пароль не указан, сгенерирован: ${ADMIN_PASS_INPUT}"
fi
read -rsp "  Подтвердите пароль: " ADMIN_PASS_CONFIRM
echo
[[ "$ADMIN_PASS_INPUT" != "$ADMIN_PASS_CONFIRM" ]] && fail "Пароли не совпадают."
ok "Админ: ${ADMIN_USER}"

# --- Создание корневого .env для docker-compose ---
info "Создание .env (docker-compose) ..."
cat > .env <<EOF
DB_PASS=${DB_PASS}
EOF
ok ".env создан"

# --- Создание .env для stream-app ---
info "Создание stream-app/.env ..."
cat > stream-app/.env <<EOF
PORT=8085

# Bootstrap admin (one-time, deleted after first run)
ADMIN_BOOTSTRAP_USER=${ADMIN_USER}
ADMIN_BOOTSTRAP_PASS=${ADMIN_PASS_INPUT}

# Session
SESSION_SECRET=${SESSION_SECRET}

# Redis
REDIS_URL=redis://redis:6379

# PostgreSQL
DB_HOST=postgres
DB_USER=streamapp
DB_PASS=${DB_PASS}
DB_NAME=streamapp

# Registration
REGISTRATION_CODE=${REGISTRATION_CODE}

# WHEP playback (browser → MediaMTX)
STREAM_HOST=${DOMAIN}
WHEP_PORT=8889
WHEP_JWT_SECRET=${WHEP_JWT_SECRET}

# MediaMTX Control API
MEDIAMTX_API_HOST=mediamtx
MEDIAMTX_API_PORT=9997
MEDIAMTX_API_USER=api
MEDIAMTX_API_PASS=${MEDIAMTX_API_PASS}

# SRT ingest
SRT_INGEST_HOST=${DOMAIN}
SRT_INGEST_PORT=8890
SRT_LATENCY=300000
SRT_PASSPHRASE=${SRT_PASSPHRASE}
SRT_PBKEYLEN=32

# Voice
VOICE_JWT_SECRET=${VOICE_JWT_SECRET}
VOICE_SERVER_URL=ws://voice-server:4001
VOICE_SERVER_SECRET=${VOICE_SERVER_SECRET}

# Base URL (for emails, redirects, etc.)
BASE_URL=https://${DOMAIN}
EOF
ok "stream-app/.env создан"

# --- Создание .env для voice-server ---
info "Создание voice-server/.env ..."
cat > voice-server/.env <<EOF
NODE_ENV=production
PORT=4001

# Must match stream-app
VOICE_JWT_SECRET=${VOICE_JWT_SECRET}
VOICE_SERVER_SECRET=${VOICE_SERVER_SECRET}

# Public IP of this server (IMPORTANT for WebRTC)
ANNOUNCED_IP=${PUBLIC_IP}

# UDP range for mediasoup
RTP_MIN_PORT=40000
RTP_MAX_PORT=40100

# URL of stream-app for DB cleanup callbacks
STREAM_APP_URL=http://stream-app:8085

# Delay before auto-deleting empty non-permanent rooms (ms)
ROOM_CLEANUP_DELAY_MS=60000
EOF
ok "voice-server/.env создан"

# --- Обновление mediamtx.yml ---
info "Настройка mediamtx/mediamtx.yml ..."
cat > mediamtx/mediamtx.yml <<EOF
logLevel: info
logDestinations: [stdout]

# Protocols
srt: yes
srtAddress: :8890
hls: no
rtsp: no
rtmp: no
rtmpAddress: :1935

# WebRTC playback from browser
webrtc: yes
webrtcAddress: :8889
webrtcAllowOrigins: ["*"]
webrtcLocalUDPAddress: :8189

# WebRTC ICE
webrtcIPsFromInterfaces: yes
webrtcAdditionalHosts: ["${PUBLIC_IP}"]

# TLS for WebRTC
webrtcEncryption: yes
webrtcServerKey: /etc/letsencrypt/live/${DOMAIN}/privkey.pem
webrtcServerCert: /etc/letsencrypt/live/${DOMAIN}/fullchain.pem

# HTTP auth (delegated to stream-app)
authMethod: http
authHTTPAddress: "http://stream-app:8085/api/mediamtx/auth"

# Control API
api: yes
apiAddress: :9997

# Stream paths
paths:
  "~^live/":
    source: publisher
    srtPublishPassphrase: "${SRT_PASSPHRASE}"
EOF
ok "mediamtx/mediamtx.yml настроен"

# --- Обновление docker-compose.yml (секреты из переменных) ---
info "Обновление docker-compose.yml ..."
cat > docker-compose.yml <<EOF
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: streamapp
      POSTGRES_USER: streamapp
      POSTGRES_PASSWORD: \${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U streamapp -d streamapp"]
      interval: 5s
      timeout: 3s
      retries: 10

  stream-app:
    build: ./stream-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    env_file: ./stream-app/.env
    volumes:
      - notify-sounds:/app/src/public/notify_sounds
    ports:
      - "127.0.0.1:8085:8085"
    extra_hosts:
      - "host.docker.internal:host-gateway"

  voice-server:
    build: ./voice-server
    restart: unless-stopped
    env_file: ./voice-server/.env
    ports:
      - "127.0.0.1:4001:4001"
      - "40000-40100:40000-40100/udp"
    extra_hosts:
      - "host.docker.internal:host-gateway"

  mediamtx:
    image: bluenviron/mediamtx:1
    restart: unless-stopped
    volumes:
      - ./mediamtx/mediamtx.yml:/mediamtx.yml:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro
    environment:
      - SSL_CERT_DIR=/etc/ssl/certs
      - WEBSOCKET_SERVER_TRUSTED_CA=/etc/ssl/certs/ca-certificates.crt
    ports:
      - "8888-8890:8888-8890"
      - "8888-8890:8888-8890/udp"
      - "8189:8189/udp"
      - "9997:9997"
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  pgdata:
  redisdata:
  notify-sounds:
EOF
ok "docker-compose.yml обновлён"

# --- Итог ---
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Установка завершена успешно!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "  Домен:       ${CYAN}${DOMAIN}${NC}"
echo -e "  Публичный IP: ${CYAN}${PUBLIC_IP}${NC}"
echo
echo -e "  ${YELLOW}Секреты (сохраните, они не восстановятся!):${NC}"
echo
echo -e "  DB пароль:          ${YELLOW}${DB_PASS}${NC}"
echo -e "  Session secret:     ${YELLOW}${SESSION_SECRET}${NC}"
echo -e "  Voice JWT secret:   ${YELLOW}${VOICE_JWT_SECRET}${NC}"
echo -e "  WHEP JWT secret:    ${YELLOW}${WHEP_JWT_SECRET}${NC}"
echo -e "  MediaMTX API pass:  ${YELLOW}${MEDIAMTX_API_PASS}${NC}"
echo -e "  Код регистрации:    ${YELLOW}${REGISTRATION_CODE}${NC}"
echo -e "  Админ логин:        ${YELLOW}${ADMIN_USER}${NC}"
echo -e "  Админ пароль:       ${YELLOW}${ADMIN_PASS_INPUT}${NC}"
echo -e "  SRT passphrase:     ${YELLOW}${SRT_PASSPHRASE}${NC}"
echo
echo -e "  ${CYAN}Следующие шаги:${NC}"
echo -e "  1. Убедитесь, что Let's Encrypt сертификаты есть в /etc/letsencrypt/live/${DOMAIN}/"
echo -e "  2. Настройте reverse proxy (nginx/caddy) для домена → порты 8085, 8889, 4001"
echo -e "  3. Запустите: ${CYAN}docker compose up -d --build${NC}"
echo
echo -e "  ${YELLOW}Важно:${NC} Откройте UDP порты 40000-40100, 8189, 8888-8890 на фаерволе."
echo
echo -e "  ${CYAN}Получите сертификат:${NC} certbot --nginx -d ${CERTBOT_DOMAINS}"
echo

# --- Запуск? ---
echo -ne "${CYAN}Запустить docker compose сейчас? (y/N): ${NC}"
read -r START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
  echo
  info "Запуск стека..."
  docker compose up -d --build
  ok "Стек запущен! Статус: docker compose ps"
  echo
  info "Логи: docker compose logs -f"
  info "Админ создан при первом запуске stream-app (ADMIN_BOOTSTRAP_USER)"
fi
