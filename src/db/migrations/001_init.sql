CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  first_name TEXT,
  goal_type TEXT CHECK (goal_type IN ('lose', 'gain', 'maintain')),
  target_weight_kg REAL,
  daily_calories INT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  premium BOOLEAN NOT NULL DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  calories INT NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  advice TEXT,
  photo_file_id TEXT,
  usda_fdc_id INT,
  calories_source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_created ON meals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals (user_id, ((created_at AT TIME ZONE 'UTC')::date));
