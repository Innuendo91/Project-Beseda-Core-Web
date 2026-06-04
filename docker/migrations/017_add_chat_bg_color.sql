-- replace image background + opacity with simple RGBA color
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS bg_color VARCHAR(7) DEFAULT '';
