-- attachment retention setting
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS attachment_retention_days SMALLINT NOT NULL DEFAULT 0;
