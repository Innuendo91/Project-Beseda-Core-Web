-- voice_rooms
CREATE TABLE IF NOT EXISTS voice_rooms (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(64) NOT NULL,
  created_by VARCHAR(24) NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL DEFAULT 0,
  pass_hash VARCHAR(255) DEFAULT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_voice_rooms_slug ON voice_rooms(slug);
