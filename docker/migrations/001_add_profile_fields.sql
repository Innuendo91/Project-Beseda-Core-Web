-- Migration: add profile fields to users table
-- Run this on existing databases to add display_name, avatar, nick_color, bio

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(64) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS nick_color VARCHAR(7) DEFAULT '#60a5fa';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(500) DEFAULT '';
