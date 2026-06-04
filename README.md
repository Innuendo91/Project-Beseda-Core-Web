# Project Beseda / stream-project

`stream-project` - серверная часть Project Beseda: веб-портал для трансляций, чата, голосовых комнат и desktop-клиента. Проект поднимается через Docker Compose и состоит из основного Node.js приложения, голосового SFU на mediasoup, MediaMTX для видеопотока, PostgreSQL и Redis.

## Возможности

- игровые трансляции и вебинары;
- просмотр потоков через WebRTC/WHEP;
- SRT ingest для публикации стрима;
- общий чат, текстовые комнаты и личные сообщения;
- голосовые комнаты через mediasoup;
- админ-панель для пользователей, комнат, стикеров, звуков уведомлений и настроек сайта;
- публичные настройки сайта для desktop-клиента: `GET /api/site-settings`;
- desktop API для авторизации, чата, голоса, настроек и remote play;
- push-уведомления и звуковые уведомления.

## Архитектура

```text
stream-project/
  stream-app/       Express + Vue SPA, API, WebSocket chat, admin panel
  voice-server/     mediasoup voice server
  mediamtx/         MediaMTX config for SRT ingest and WHEP playback
  docker/           database init/migrations
  docker-compose.yml
  install.sh
```

Основной поток работы:

1. Стример публикует видео в MediaMTX по SRT.
2. Зритель получает WHEP-конфиг и токен через `stream-app`.
3. Зритель подключается к MediaMTX по WebRTC/WHEP.
4. Чат и desktop-события идут через WebSocket в `stream-app`.
5. Голосовые комнаты обслуживает `voice-server`, а `stream-app` выдает токены и проксирует desktop-подключения.

## Требования

- Linux-сервер с Docker и Docker Compose;
- домен с HTTPS, обычно через nginx;
- открытые UDP-порты для MediaMTX WebRTC и mediasoup;
- сертификаты Let's Encrypt, если MediaMTX работает с включенным WebRTC TLS;
- Node.js нужен только для локальной разработки вне Docker.

## Быстрый запуск

На сервере:

```bash
git clone <repo-url> stream-project
cd stream-project
chmod +x install.sh
./install.sh
docker compose up -d --build
```

`install.sh` подготавливает `.env` файлы и секреты. После запуска проверь логи:

```bash
docker compose ps
docker compose logs -f stream-app
docker compose logs -f voice-server
docker compose logs -f mediamtx
```

## Конфигурация

Основные файлы:

- `.env` - переменные для `docker-compose.yml`, минимум `DB_PASS`;
- `stream-app/.env` - порт, база, Redis, SRT/WHEP, JWT, MediaMTX API, настройки desktop/voice;
- `voice-server/.env` - порт voice-сервера, JWT-секреты, публичный IP, RTP UDP range;
- `mediamtx/mediamtx.yml` - SRT, WHEP/WebRTC, API и авторизация MediaMTX.

Примеры лежат в:

```text
.env.example
stream-app/.env.example
voice-server/.env.example
```

Важные переменные `stream-app/.env`:

```env
PORT=8085
BASE_URL=https://your.domain.com

DB_HOST=postgres
DB_USER=streamapp
DB_PASS=...
DB_NAME=streamapp
REDIS_URL=redis://redis:6379

STREAM_HOST=your.domain.com
WHEP_PORT=8889
WHEP_JWT_SECRET=...

SRT_INGEST_HOST=your.domain.com
SRT_INGEST_PORT=8890
SRT_LATENCY=300000
SRT_PASSPHRASE=...
SRT_PBKEYLEN=32

VOICE_JWT_SECRET=...
VOICE_SERVER_URL=ws://voice-server:4001
VOICE_SERVER_SECRET=...
```

Важные переменные `voice-server/.env`:

```env
PORT=4001
ANNOUNCED_IP=YOUR_PUBLIC_IP
RTP_MIN_PORT=40000
RTP_MAX_PORT=40100
VOICE_JWT_SECRET=...
VOICE_SERVER_SECRET=...
STREAM_APP_URL=http://stream-app:8085
```

`VOICE_JWT_SECRET` и `VOICE_SERVER_SECRET` должны совпадать в `stream-app/.env` и `voice-server/.env`.

## Порты

Порты из текущего `docker-compose.yml`:

| Сервис | Порт | Назначение |
| --- | --- | --- |
| `stream-app` | `127.0.0.1:8085` | веб-интерфейс, API, WebSocket |
| `voice-server` | `127.0.0.1:4001` | mediasoup signaling |
| `voice-server` | `40000-40100/udp` | mediasoup RTP |
| `mediamtx` | `8890/tcp+udp` | SRT ingest |
| `mediamtx` | `8889/tcp` | WebRTC/WHEP |
| `mediamtx` | `8189/udp` | WebRTC ICE/UDP |
| `mediamtx` | `9997/tcp` | MediaMTX API |
| `postgres` | `127.0.0.1:5432` | PostgreSQL локально |

Для production обычно наружу отдается nginx на `443`, а `stream-app` остается доступным только локально.

## nginx

Минимальный пример для веба, чата и voice WebSocket:

```nginx
location / {
    proxy_pass http://127.0.0.1:8085;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Cookie $http_cookie;
}

location /ws/ {
    proxy_pass http://127.0.0.1:8085;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}

location /voice/ {
    proxy_pass http://127.0.0.1:8085;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

MediaMTX WHEP и SRT могут идти напрямую на свои порты или через отдельную прокси-настройку, в зависимости от схемы сервера.

## Разработка

Backend `stream-app`:

```bash
cd stream-app
npm install
npm run dev
```

SPA:

```bash
cd stream-app
npm run dev:spa
npm run build:spa
```

Voice server:

```bash
cd voice-server
npm install
npm run dev
```

Production-старт внутри контейнера:

```bash
npm start
```

## Админ-панель

Админ создается через bootstrap-переменные в `stream-app/.env`:

```env
ADMIN_BOOTSTRAP_USER=admin
ADMIN_BOOTSTRAP_PASS=strongpassword
```

После первого запуска и создания пользователя эти переменные лучше убрать или закомментировать.

В админке настраиваются:

- пользователи и права администратора;
- комнаты чата;
- голосовые комнаты;
- название сайта и публичные настройки;
- SRT passphrase;
- стикеры;
- звуки уведомлений;
- попытки авторизации;
- очистка вложений.

## API и WebSocket

Полезные публичные/клиентские endpoints:

- `GET /api/site-settings` - публичные настройки сайта;
- `POST /api/desktop/login` - авторизация desktop-клиента;
- `GET /api/desktop/me` - текущий desktop-пользователь;
- `POST /api/desktop/logout` - выход desktop-клиента;
- `GET /api/desktop/whep-config/:path` - WHEP-конфиг для desktop-клиента;
- `GET /api/notify-sounds` - выбранные звуки уведомлений;
- `GET /api/voice-desktop/rooms` - комнаты голоса для desktop-клиента.

WebSocket:

- `/ws/` - веб-чат;
- `/ws/desktop/chat` - desktop-чат;
- `/ws/desktop/voice` - desktop voice signaling proxy;
- `/ws/desktop/remote-play` - remote play события.

## Desktop-клиент

Desktop-клиент находится в отдельном проекте `Project-Beseda-Client`. Серверная часть отдает ему:

- название сайта через `/api/site-settings`;
- desktop JWT после логина;
- WHEP URL и токен для просмотра стрима;
- настройки голосовых комнат и звуков уведомлений;
- WebSocket endpoints для чата, голоса и remote play.

## Обслуживание

Перезапуск:

```bash
docker compose restart stream-app
docker compose restart voice-server
docker compose restart mediamtx
```

Обновление после изменения кода:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f stream-app
docker compose logs -f voice-server
docker compose logs -f mediamtx
```

Бэкап базы:

```bash
docker compose exec postgres pg_dump -U streamapp streamapp > backup.sql
```

## Безопасность

- Не публикуй реальные `.env`, токены, passphrase и приватные ключи.
- Проверь, что `.env`, сертификаты, логи и временные файлы попали в `.gitignore`.
- Для production держи `stream-app`, PostgreSQL и voice signaling за nginx или локальной сетью.
- UDP-порты для WebRTC и mediasoup должны быть открыты только в нужном диапазоне.
- После bootstrap-создания админа убери `ADMIN_BOOTSTRAP_USER` и `ADMIN_BOOTSTRAP_PASS`.

## Частые проблемы

**Не подключается голосовая комната**

Проверь `ANNOUNCED_IP`, открытый UDP range `RTP_MIN_PORT-RTP_MAX_PORT`, совпадение `VOICE_JWT_SECRET` и `VOICE_SERVER_SECRET`, а также логи `voice-server`.

**Нет видеопотока через WHEP**

Проверь `STREAM_HOST`, `WHEP_PORT`, сертификаты MediaMTX, `webrtcAdditionalHosts` в `mediamtx/mediamtx.yml` и доступность UDP `8189`.

**Стрим не публикуется по SRT**

Проверь `SRT_INGEST_HOST`, `SRT_INGEST_PORT`, `SRT_PASSPHRASE`, `SRT_PBKEYLEN` и логи `mediamtx`.

**Desktop-клиент не видит название сайта или звуки**

Проверь `GET /api/site-settings`, `GET /api/notify-sounds`, volume `notify-sounds` и CORS/proxy-настройки для публичных файлов.
