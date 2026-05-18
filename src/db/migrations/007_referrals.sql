ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users (telegram_id);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id BIGINT NOT NULL REFERENCES users (telegram_id) ON DELETE CASCADE,
  referred_id BIGINT NOT NULL UNIQUE REFERENCES users (telegram_id) ON DELETE CASCADE,
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referrer_id != referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
