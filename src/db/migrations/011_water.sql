ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminders_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_interval_hours INTEGER NOT NULL DEFAULT 3;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_quiet_start TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_quiet_end TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_last_reminder_at TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminders_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminders_date TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_last_activity_at TEXT;

CREATE TABLE IF NOT EXISTS water_logs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_created ON water_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs (user_id, substr(created_at, 1, 10));
