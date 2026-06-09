-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(24) UNIQUE NOT NULL,
  pass_hash VARCHAR(255) NOT NULL,
  created_ts INTEGER NOT NULL DEFAULT 0,
  last_login_ts INTEGER,
  publish_token TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  chat_muted BOOLEAN NOT NULL DEFAULT FALSE,
  voice_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_name VARCHAR(64) DEFAULT '',
  avatar TEXT DEFAULT '',
  nick_color VARCHAR(7) DEFAULT '#60a5fa',
  bio VARCHAR(500) DEFAULT '',
  email TEXT DEFAULT NULL
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_muted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  ts INTEGER NOT NULL DEFAULT 0,
  nick VARCHAR(24) NOT NULL DEFAULT '',
  text VARCHAR(500) NOT NULL DEFAULT '',
  room VARCHAR(128) NOT NULL DEFAULT 'global',
  sticker_data TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room, id DESC);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_data TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_data TEXT DEFAULT '';

-- remember_tokens
CREATE TABLE IF NOT EXISTS remember_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selector VARCHAR(24) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  created_ts INTEGER NOT NULL DEFAULT 0,
  expires_ts INTEGER NOT NULL DEFAULT 0,
  last_used_ts INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_remember_selector ON remember_tokens(selector);
CREATE INDEX IF NOT EXISTS idx_remember_user ON remember_tokens(user_id);

-- voice_settings
CREATE TABLE IF NOT EXISTS voice_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  noise_suppression BOOLEAN NOT NULL DEFAULT TRUE,
  echo_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
  auto_gain BOOLEAN NOT NULL DEFAULT TRUE,
  input_gain SMALLINT NOT NULL DEFAULT 100,
  self_monitor BOOLEAN NOT NULL DEFAULT FALSE,
  self_monitor_delay_ms SMALLINT NOT NULL DEFAULT 200,
  vad_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vad_threshold SMALLINT NOT NULL DEFAULT 10,
  vad_hold_ms SMALLINT NOT NULL DEFAULT 600,
  device_id VARCHAR(255) DEFAULT '',
  chat_notify_sound BOOLEAN NOT NULL DEFAULT TRUE,
  chat_mention_sound BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_ts INTEGER NOT NULL DEFAULT 0
);

-- chat_rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL DEFAULT 0,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  background TEXT DEFAULT '',
  bg_opacity SMALLINT NOT NULL DEFAULT 50,
  font_size SMALLINT NOT NULL DEFAULT 13,
  tab_text_color VARCHAR(7) DEFAULT '',
  tab_bg_color VARCHAR(7) DEFAULT '',
  tab_border_color VARCHAR(7) DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_order ON chat_rooms(sort_order ASC, id ASC);
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS bg_opacity SMALLINT NOT NULL DEFAULT 50;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS font_size SMALLINT NOT NULL DEFAULT 13;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS tab_text_color VARCHAR(7) DEFAULT '';
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS tab_bg_color VARCHAR(7) DEFAULT '';
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS tab_border_color VARCHAR(7) DEFAULT '';
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS message_limit SMALLINT NOT NULL DEFAULT 50;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS bg_color VARCHAR(7) DEFAULT '';
-- Permanent global chat room
INSERT INTO chat_rooms(id, slug, name, sort_order, created_ts, is_permanent)
  VALUES (1, 'global', 'Общий чат', 0, 0, TRUE)
  ON CONFLICT (id) DO UPDATE SET is_permanent = TRUE;

-- voice_rooms
CREATE TABLE IF NOT EXISTS voice_rooms (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  latin_slug VARCHAR(40) UNIQUE,
  name VARCHAR(64) NOT NULL,
  created_by VARCHAR(24) NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL DEFAULT 0,
  pass_hash VARCHAR(255) DEFAULT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_voice_rooms_slug ON voice_rooms(slug);
CREATE INDEX IF NOT EXISTS idx_voice_rooms_latin_slug ON voice_rooms(latin_slug);

-- password_resets
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_ts INTEGER NOT NULL DEFAULT 0,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_ts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- site_settings (key-value, single row id=1)
CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(128) NOT NULL DEFAULT '',
  site_subtitle VARCHAR(256) NOT NULL DEFAULT '',
  registration_code VARCHAR(256) NOT NULL DEFAULT '',
  registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  srt_passphrase TEXT NOT NULL DEFAULT '',
 srt_pbkeylen SMALLINT NOT NULL DEFAULT 32,
   portal_ip VARCHAR(64) NOT NULL DEFAULT '',
  notify_sound VARCHAR(128) NOT NULL DEFAULT '',
    mention_sound VARCHAR(128) NOT NULL DEFAULT '',
    voice_join_sound VARCHAR(128) NOT NULL DEFAULT '',
    voice_leave_sound VARCHAR(128) NOT NULL DEFAULT '',
    updated_ts INTEGER NOT NULL DEFAULT 0,
    attachment_retention_days SMALLINT NOT NULL DEFAULT 0
);
INSERT INTO site_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- auth_attempts: brute-force tracking
CREATE TABLE IF NOT EXISTS auth_attempts (
  id SERIAL PRIMARY KEY,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  action VARCHAR(16) NOT NULL DEFAULT '',
  username VARCHAR(24) NOT NULL DEFAULT '',
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_ts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip, created_ts DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_action ON auth_attempts(action, created_ts DESC);

-- stickers: admin-managed sticker library
CREATE TABLE IF NOT EXISTS stickers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL DEFAULT 0
);


-- jwt_keys: stores the MediaMTX JWT signing key
CREATE TABLE IF NOT EXISTS jwt_keys (
  id SERIAL PRIMARY KEY,
  kid VARCHAR(64) NOT NULL,
  private_key TEXT NOT NULL,
  created_ts INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- push_subscriptions: browser push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh VARCHAR(256) NOT NULL,
  auth VARCHAR(256) NOT NULL,
  endpoint TEXT NOT NULL,
  room VARCHAR(128) NOT NULL DEFAULT 'global',
  created_ts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, p256dh, auth)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_room ON push_subscriptions(room);

-- dm_threads: direct message conversations between two users
CREATE TABLE IF NOT EXISTS dm_threads (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_preview VARCHAR(200) DEFAULT '',
  updated_ts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user1_id, user2_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user1 ON dm_threads(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user2 ON dm_threads(user2_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_updated ON dm_threads(updated_ts DESC);

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS attachment_retention_days SMALLINT NOT NULL DEFAULT 0;
