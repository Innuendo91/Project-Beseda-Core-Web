-- Migration: add dm_threads table for direct messages
-- Run: psql -h <host> -U streamapp -d streamapp -f docker/migrations/001_add_dm_threads.sql

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
