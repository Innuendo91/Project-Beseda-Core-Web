# stream-node (Stream + Chat on Node.js)

This is a Node.js port of your PHP project:
- MediaMTX stays as streaming server (SRT/WHIP ingest, WHEP playback)
- Node.js serves the website, auth (per-user), profile, and realtime chat via WebSocket
- MySQL stores users + last 50 chat messages

## Requirements
- Node.js 18+
- MySQL 8+ (or MariaDB compatible)
- MediaMTX running (WHEP on 8889, Control API on 9997 with Basic auth)
- Your MediaMTX `reader.js` placed into `src/public/reader.js`

## Database setup
Create DB + tables:

```sql
CREATE DATABASE IF NOT EXISTS streamchat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE streamchat;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(24) NOT NULL,
  pass_hash VARCHAR(255) NOT NULL,
  created_ts INT NOT NULL,
  last_login_ts INT DEFAULT NULL,
  UNIQUE KEY (username)
);

CREATE TABLE messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts INT NOT NULL,
  nick VARCHAR(24) NOT NULL,
  text VARCHAR(500) NOT NULL,
  room VARCHAR(128) NOT NULL DEFAULT 'global',
  INDEX(ts),
  INDEX(room, ts)
);

CREATE TABLE remember_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  selector CHAR(24) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_ts INT NOT NULL,
  expires_ts INT NOT NULL,
  last_used_ts INT DEFAULT NULL,
  UNIQUE KEY (selector),
  INDEX(user_id),
  CONSTRAINT fk_remember_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Configure
1) Copy `.env.example` to `.env` and edit values.

2) Put MediaMTX `reader.js` into:
`src/public/reader.js`

## Install & run
```bash
cd stream-node
npm i
npm run dev
```

Open:
- http://localhost:8080/register  (use REGISTRATION_CODE)
- http://localhost:8080/          (streams list)
- http://localhost:8080/profile   (OBS/SRT URL)

## Nginx (optional reverse proxy)
Example (proxy to Node on 8080):

```
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
For WebSocket:
```
location /ws/ {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## Notes
- Chat is XSS-safe: messages rendered via `textContent`, server also normalizes input.
- Only last 50 messages are kept (same as your PHP version).


## Upgrade / migrations
If you already have a database created from an earlier version, apply:

```bash
mysql -u <user> -p <db_name> < db/migrations.sql
```

This adds:
- `messages.room` (rooms: `global` + per-stream `live/<user>`)
- `remember_tokens` table for "remember me" (30 days)
