ALTER TABLE users
  ADD COLUMN IF NOT EXISTS premium_plan TEXT CHECK (premium_plan IN ('basic', 'pro', 'ultra'));
