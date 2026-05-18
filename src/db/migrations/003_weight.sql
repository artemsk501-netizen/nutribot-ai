CREATE TABLE IF NOT EXISTS weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_user_created ON weight_entries (user_id, created_at DESC);
