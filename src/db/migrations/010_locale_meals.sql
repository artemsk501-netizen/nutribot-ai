ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT CHECK (locale IN ('ru', 'en', 'it'));

ALTER TABLE meals ADD COLUMN IF NOT EXISTS grams REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS portion_size TEXT CHECK (portion_size IN ('small', 'medium', 'large', 'custom'));
ALTER TABLE meals ADD COLUMN IF NOT EXISTS confidence REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS calories_per_100g REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS protein_per_100g REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS fat_per_100g REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS carbs_per_100g REAL;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user_corrected'));
