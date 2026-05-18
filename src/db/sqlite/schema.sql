CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  first_name TEXT,
  language_code TEXT,
  referred_by INTEGER REFERENCES users (telegram_id),
  goal_type TEXT CHECK (goal_type IN ('lose', 'gain', 'maintain')),
  current_weight_kg REAL,
  target_weight_kg REAL,
  height_cm INTEGER,
  age INTEGER,
  activity_level TEXT CHECK (activity_level IN ('low', 'medium', 'high')),
  daily_calories INTEGER,
  protein_goal_g INTEGER,
  fat_goal_g INTEGER,
  carbs_goal_g INTEGER,
  onboarding_step TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  subscription_plan TEXT NOT NULL DEFAULT 'free' CHECK (subscription_plan IN ('free', 'premium')),
  premium INTEGER NOT NULL DEFAULT 0,
  premium_plan TEXT CHECK (premium_plan IN ('basic', 'pro', 'ultra')),
  premium_expires_at TEXT,
  weekly_reports_enabled INTEGER NOT NULL DEFAULT 1,
  last_weekly_report_at TEXT,
  daily_reminders_enabled INTEGER NOT NULL DEFAULT 1,
  last_daily_reminder_at TEXT,
  scans_today INTEGER NOT NULL DEFAULT 0,
  ai_messages_today INTEGER NOT NULL DEFAULT 0,
  last_usage_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  advice TEXT,
  photo_file_id TEXT,
  usda_fdc_id INTEGER,
  calories_source TEXT NOT NULL DEFAULT 'ai',
  micronutrients TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meals_user_created ON meals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals (user_id, substr(created_at, 1, 10));

CREATE TABLE IF NOT EXISTS weight_entries (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weight_user_created ON weight_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_stats (
  user_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  total_calories INTEGER NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  meal_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  telegram_payment_charge_id TEXT,
  provider_payment_charge_id TEXT,
  payload TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'ultra')),
  stars INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments (created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL UNIQUE REFERENCES users (telegram_id) ON DELETE CASCADE,
  reward_granted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (referrer_id != referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
