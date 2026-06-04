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
