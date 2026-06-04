-- jwt_keys: stores the MediaMTX JWT signing key
CREATE TABLE IF NOT EXISTS jwt_keys (
  id SERIAL PRIMARY KEY,
  kid VARCHAR(64) NOT NULL,
  private_key TEXT NOT NULL,
  created_ts INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
