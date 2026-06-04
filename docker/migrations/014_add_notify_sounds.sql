-- notify sounds: file names in public/notify_sounds/
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS notify_sound VARCHAR(128) DEFAULT '';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS mention_sound VARCHAR(128) DEFAULT '';
