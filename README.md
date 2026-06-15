# Project Beseda Core Web

Project Beseda - self-hosted видео + голосовая платформа для небольших сообществ, совместных игр, стримов и вебинаров.

Серверная часть включает веб-интерфейс, API, чат, стримы, голосовые комнаты и интеграцию с desktop-клиентом.

## Основной функционал

- веб-клиент на Vue SPA;
- PWA: веб-клиент можно установить как приложение;
- просмотр стримов через WebRTC/WHEP;
- публикация стримов через OBS или через приложение;
- общий чат, комнаты чата, личные сообщения и пересылка картинок;
- возможность общаться со стримером голосом или текстом;
- голосовые комнаты через mediasoup;
- remote play через desktop-приложение;
- админ-панель для пользователей, комнат, стикеров, звуков и настроек сайта;
- API и WebSocket endpoints для desktop-клиента;
- push-уведомления и звуки уведомлений.

## Desktop-клиент

Desktop-клиент находится в отдельном проекте `Project-Beseda-Client`.

Сервер отдает ему:

- авторизацию и desktop JWT;
- настройки сайта;
- список стримов и WHEP-конфиг;
- чат и личные сообщения;
- голосовые комнаты;
- события remote play.

## Серверный стек

- `stream-app` - Node.js / Express, Vue SPA, API, WebSocket chat;
- `voice-server` - Node.js WebSocket server + mediasoup;
- `mediamtx` - SRT ingest и WebRTC/WHEP playback;
- `postgres` - база данных;
- `redis` - session/cache storage;
- `nginx` - HTTPS reverse proxy перед `stream-app`.

## Порты

| Сервис | Порт | Назначение |
| --- | --- | --- |
| nginx | `443/tcp` | внешний HTTPS вход |
| stream-app | `127.0.0.1:8085` | веб, API, WebSocket |
| voice-server | `127.0.0.1:4001` | voice signaling |
| voice-server | `40000-40100/udp` | mediasoup RTP |
| mediamtx | `8889/tcp` | WebRTC/WHEP |
| mediamtx | `8890/tcp+udp` | SRT ingest |
| mediamtx | `8189/udp` | WebRTC ICE |
| mediamtx | `9997/tcp` | MediaMTX API |
| postgres | `127.0.0.1:5432` | PostgreSQL локально |
| redis | internal | Redis внутри Docker-сети |

Для разработки SPA используется Vite на `5173`.

## Требования к серверу

- Linux-сервер с Docker и Docker Compose;
- домен с рабочим HTTPS-сертификатом;
- nginx или другой reverse proxy на `443`;
- открытые UDP-порты для WebRTC/mediasoup;
- публичный IP для `ANNOUNCED_IP` в voice-server;
- HTTPS обязателен для WebRTC, камеры/микрофона, push-уведомлений и корректной работы desktop/web-клиентов.

## Быстрый запуск

Полная установка на чистый VDS-сервер с установкой системных зависимостей:
===================
Debian
```bash
apt update
apt install git
git clone https://github.com/Innuendo91/Project-Beseda-Core-Web
cd Project-Beseda-Core-Web
chmod +x install_full_debian.sh
./install_full_debian.sh
```
Ubuntu
```bash
apt update
apt install git
git clone https://github.com/Innuendo91/Project-Beseda-Core-Web
cd Project-Beseda-Core-Web
chmod +x install_full_ubuntu.sh
./install_full_ubuntu.sh
```
=================
Обычный запуск, если Docker и зависимости уже установлены:

```bash
chmod +x install.sh
./install.sh
docker compose up -d --build
```

Проверка:

```bash
docker compose ps
docker compose logs -f stream-app
docker compose logs -f voice-server
docker compose logs -f mediamtx
```

## Настройка сервера почты для восстановления паролей
```text
- `stream-app/.env` 
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## Основные env-файлы

- `.env` - переменные Docker Compose;
- `stream-app/.env` - web/API, база, Redis, SRT/WHEP, JWT, desktop/voice настройки;
- `voice-server/.env` - voice signaling, mediasoup RTP range, публичный IP;
- `mediamtx/mediamtx.yml` - SRT, WHEP/WebRTC и MediaMTX API.

Примеры лежат в:

```text
.env.example
stream-app/.env.example
voice-server/.env.example
```

## Разработка

Backend:

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

## Обслуживание

```bash
docker compose restart stream-app
docker compose restart voice-server
docker compose restart mediamtx
docker compose up -d --build
```

Бэкап базы:

```bash
docker compose exec postgres pg_dump -U streamapp streamapp > backup.sql
```
