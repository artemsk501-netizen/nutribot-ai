import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config.js";
import { initSqlite } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runSqliteMigrations(): Promise<void> {
  const database = initSqlite();
  const schemaPath = path.join(__dirname, "schema.sql");
  const filename = "schema.sql";

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = database
    .prepare("SELECT 1 FROM schema_migrations WHERE filename = ?")
    .get(filename);

  if (!applied) {
    const sql = fs.readFileSync(schemaPath, "utf-8");
    database.exec(sql);
    database.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(filename);
    console.log(`SQLite migration applied: ${filename} → ${config.SQLITE_PATH}`);
  }

  ensurePremiumColumns(database);
}

function ensurePremiumColumns(database: ReturnType<typeof initSqlite>): void {
  const columns = database
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has("premium_plan")) {
    database.exec("ALTER TABLE users ADD COLUMN premium_plan TEXT");
  }
  if (!names.has("language_code")) {
    database.exec("ALTER TABLE users ADD COLUMN language_code TEXT");
  }
  if (!names.has("referred_by")) {
    database.exec("ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users (telegram_id)");
  }
  if (!names.has("current_weight_kg")) {
    database.exec("ALTER TABLE users ADD COLUMN current_weight_kg REAL");
  }
  if (!names.has("height_cm")) {
    database.exec("ALTER TABLE users ADD COLUMN height_cm INTEGER");
  }
  if (!names.has("age")) {
    database.exec("ALTER TABLE users ADD COLUMN age INTEGER");
  }
  if (!names.has("activity_level")) {
    database.exec("ALTER TABLE users ADD COLUMN activity_level TEXT");
  }
  if (!names.has("protein_goal_g")) {
    database.exec("ALTER TABLE users ADD COLUMN protein_goal_g INTEGER");
  }
  if (!names.has("fat_goal_g")) {
    database.exec("ALTER TABLE users ADD COLUMN fat_goal_g INTEGER");
  }
  if (!names.has("carbs_goal_g")) {
    database.exec("ALTER TABLE users ADD COLUMN carbs_goal_g INTEGER");
  }
  if (!names.has("onboarding_step")) {
    database.exec("ALTER TABLE users ADD COLUMN onboarding_step TEXT");
  }
  if (!names.has("subscription_plan")) {
    database.exec("ALTER TABLE users ADD COLUMN subscription_plan TEXT NOT NULL DEFAULT 'free'");
  }
  if (!names.has("scans_today")) {
    database.exec("ALTER TABLE users ADD COLUMN scans_today INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("ai_messages_today")) {
    database.exec("ALTER TABLE users ADD COLUMN ai_messages_today INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("last_usage_date")) {
    database.exec("ALTER TABLE users ADD COLUMN last_usage_date TEXT");
  }
  if (!names.has("daily_reminders_enabled")) {
    database.exec("ALTER TABLE users ADD COLUMN daily_reminders_enabled INTEGER NOT NULL DEFAULT 1");
  }
  if (!names.has("last_daily_reminder_at")) {
    database.exec("ALTER TABLE users ADD COLUMN last_daily_reminder_at TEXT");
  }

  database.exec(`
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
  `);
}
