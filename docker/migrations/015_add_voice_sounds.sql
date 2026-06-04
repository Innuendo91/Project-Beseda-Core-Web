-- voice room join/leave sounds: file names in public/notify_sounds/
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS voice_join_sound VARCHAR(128) DEFAULT '';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS voice_leave_sound VARCHAR(128) DEFAULT '';
