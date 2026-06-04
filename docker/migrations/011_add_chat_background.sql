-- chat_rooms: background image URL
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS background TEXT DEFAULT '';
