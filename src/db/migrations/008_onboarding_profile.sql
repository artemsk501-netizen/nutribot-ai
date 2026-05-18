ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_weight_kg REAL,
  ADD COLUMN IF NOT EXISTS height_cm INT,
  ADD COLUMN IF NOT EXISTS age INT,
  ADD COLUMN IF NOT EXISTS activity_level TEXT CHECK (activity_level IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS protein_goal_g INT,
  ADD COLUMN IF NOT EXISTS fat_goal_g INT,
  ADD COLUMN IF NOT EXISTS carbs_goal_g INT,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT;
