ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free' CHECK (subscription_plan IN ('free', 'premium')),
  ADD COLUMN IF NOT EXISTS scans_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_messages_today INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_usage_date TEXT;
