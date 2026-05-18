ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language_code TEXT,
  ADD COLUMN IF NOT EXISTS daily_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_daily_reminder_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  telegram_payment_charge_id TEXT,
  provider_payment_charge_id TEXT,
  payload TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'ultra')),
  stars INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments (created_at DESC);
