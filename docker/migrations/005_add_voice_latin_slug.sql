ALTER TABLE voice_rooms ADD COLUMN IF NOT EXISTS latin_slug VARCHAR(40);
UPDATE voice_rooms SET latin_slug = slug WHERE latin_slug IS NULL AND slug ~ '^[a-z0-9-]+$';
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_rooms_latin_slug ON voice_rooms(latin_slug);
