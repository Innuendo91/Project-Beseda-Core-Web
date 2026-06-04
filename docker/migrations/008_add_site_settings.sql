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
  updated_ts INTEGER NOT NULL DEFAULT 0
);
