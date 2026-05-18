-- premium_expires_at уже в 001; убедимся что колонка есть
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;
