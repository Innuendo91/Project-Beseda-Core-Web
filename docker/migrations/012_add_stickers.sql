-- stickers: admin-managed sticker library
CREATE TABLE IF NOT EXISTS stickers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL DEFAULT 0
);

-- messages: add sticker_data column for sticker messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_data TEXT DEFAULT '';
