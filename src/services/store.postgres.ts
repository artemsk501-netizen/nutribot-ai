import type { Pool } from "pg";
import type {
  AdminMetrics,
  DayStats,
  MealEntry,
  Micronutrients,
  MonthStats,
  PaymentRecord,
  ReferralStats,
  UsageKind,
  UsageStatus,
  UserGoal,
  UserProfile,
  WeightEntry,
  WeightHistory,
} from "../types/index.js";
import type { Store } from "./store.interface.js";
import { applyPremiumStatus, isPremiumActive, normalizePremiumPlan } from "./premium.js";
import { buildDayStats, buildWeekStats } from "./statsUtils.js";
import { getFreeLimit, getSubscriptionPlan } from "./usageLimits.js";

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rowToUser(row: Record<string, unknown>): UserProfile {
  const goalType = row.goal_type as string | null;
  return {
    telegramId: Number(row.telegram_id),
    firstName: (row.first_name as string) ?? undefined,
    languageCode: (row.language_code as string) ?? undefined,
    referredBy: row.referred_by != null ? Number(row.referred_by) : undefined,
    goal: goalType
      ? {
          type: goalType as UserGoal["type"],
          targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : undefined,
          dailyCalories: Number(row.daily_calories),
        }
      : undefined,
    currentWeightKg: row.current_weight_kg != null ? Number(row.current_weight_kg) : undefined,
    targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : undefined,
    heightCm: row.height_cm != null ? Number(row.height_cm) : undefined,
    age: row.age != null ? Number(row.age) : undefined,
    activityLevel:
      row.activity_level === "low" || row.activity_level === "medium" || row.activity_level === "high"
        ? row.activity_level
        : undefined,
    proteinGoalG: row.protein_goal_g != null ? Number(row.protein_goal_g) : undefined,
    fatGoalG: row.fat_goal_g != null ? Number(row.fat_goal_g) : undefined,
    carbsGoalG: row.carbs_goal_g != null ? Number(row.carbs_goal_g) : undefined,
    onboardingStep:
      row.onboarding_step === "goal" ||
      row.onboarding_step === "current_weight" ||
      row.onboarding_step === "target_weight" ||
      row.onboarding_step === "height" ||
      row.onboarding_step === "age" ||
      row.onboarding_step === "activity" ||
      row.onboarding_step === "complete"
        ? row.onboarding_step
        : undefined,
    onboardingComplete: Boolean(row.onboarding_complete),
    subscriptionPlan: row.subscription_plan === "premium" ? "premium" : "free",
    premium: Boolean(row.premium),
    premiumPlan: normalizePremiumPlan(row.premium_plan),
    premiumExpiresAt: row.premium_expires_at
      ? new Date(row.premium_expires_at as string).toISOString()
      : undefined,
    weeklyReportsEnabled: row.weekly_reports_enabled !== false,
    lastWeeklyReportAt: row.last_weekly_report_at
      ? new Date(row.last_weekly_report_at as string).toISOString()
      : undefined,
    dailyRemindersEnabled: row.daily_reminders_enabled !== false,
    lastDailyReminderAt: row.last_daily_reminder_at
      ? new Date(row.last_daily_reminder_at as string).toISOString()
      : undefined,
    scansToday: row.scans_today != null ? Number(row.scans_today) : 0,
    aiMessagesToday: row.ai_messages_today != null ? Number(row.ai_messages_today) : 0,
    lastUsageDate: (row.last_usage_date as string) ?? undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function rowToMeal(row: Record<string, unknown>): MealEntry {
  const micro = row.micronutrients;
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    dishName: String(row.dish_name),
    calories: Number(row.calories),
    macros: {
      proteinG: Number(row.protein_g),
      fatG: Number(row.fat_g),
      carbsG: Number(row.carbs_g),
    },
    advice: (row.advice as string) ?? undefined,
    photoFileId: (row.photo_file_id as string) ?? undefined,
    usdaFdcId: row.usda_fdc_id != null ? Number(row.usda_fdc_id) : undefined,
    caloriesSource: (row.calories_source as MealEntry["caloriesSource"]) ?? "ai",
    micronutrients:
      micro && typeof micro === "object" ? (micro as Micronutrients) : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export class PostgresStore implements Store {
  constructor(private pool: Pool) {}

  async getUser(telegramId: number): Promise<UserProfile | undefined> {
    const { rows } = await this.pool.query("SELECT * FROM users WHERE telegram_id = $1", [
      telegramId,
    ]);
    if (!rows[0]) return undefined;

    const raw = rowToUser(rows[0]);
    const user = applyPremiumStatus(raw);
    if (raw.premium && !user.premium) {
      await this.pool.query(
        `UPDATE users SET subscription_plan = 'free', premium = FALSE, premium_plan = NULL, premium_expires_at = NULL WHERE telegram_id = $1`,
        [telegramId],
      );
    }
    return user;
  }

  async upsertUser(profile: Partial<UserProfile> & { telegramId: number }): Promise<UserProfile> {
    const existing = await this.getUser(profile.telegramId);

    const { rows } = await this.pool.query(
      `INSERT INTO users (
         telegram_id, first_name, language_code, referred_by, goal_type, current_weight_kg,
         target_weight_kg, height_cm, age, activity_level, daily_calories,
         protein_goal_g, fat_goal_g, carbs_goal_g, onboarding_step,
         onboarding_complete, subscription_plan, premium, premium_plan, premium_expires_at, weekly_reports_enabled,
         last_weekly_report_at, daily_reminders_enabled, last_daily_reminder_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       ON CONFLICT (telegram_id) DO UPDATE SET
         first_name = COALESCE(EXCLUDED.first_name, users.first_name),
         language_code = COALESCE(EXCLUDED.language_code, users.language_code),
         referred_by = COALESCE(EXCLUDED.referred_by, users.referred_by),
         goal_type = COALESCE(EXCLUDED.goal_type, users.goal_type),
         current_weight_kg = COALESCE(EXCLUDED.current_weight_kg, users.current_weight_kg),
         target_weight_kg = COALESCE(EXCLUDED.target_weight_kg, users.target_weight_kg),
         height_cm = COALESCE(EXCLUDED.height_cm, users.height_cm),
         age = COALESCE(EXCLUDED.age, users.age),
         activity_level = COALESCE(EXCLUDED.activity_level, users.activity_level),
         daily_calories = COALESCE(EXCLUDED.daily_calories, users.daily_calories),
         protein_goal_g = COALESCE(EXCLUDED.protein_goal_g, users.protein_goal_g),
         fat_goal_g = COALESCE(EXCLUDED.fat_goal_g, users.fat_goal_g),
         carbs_goal_g = COALESCE(EXCLUDED.carbs_goal_g, users.carbs_goal_g),
         onboarding_step = COALESCE(EXCLUDED.onboarding_step, users.onboarding_step),
         onboarding_complete = COALESCE(EXCLUDED.onboarding_complete, users.onboarding_complete),
         subscription_plan = COALESCE(EXCLUDED.subscription_plan, users.subscription_plan),
         premium = COALESCE(EXCLUDED.premium, users.premium),
         premium_plan = COALESCE(EXCLUDED.premium_plan, users.premium_plan),
         premium_expires_at = COALESCE(EXCLUDED.premium_expires_at, users.premium_expires_at),
         weekly_reports_enabled = COALESCE(EXCLUDED.weekly_reports_enabled, users.weekly_reports_enabled),
         last_weekly_report_at = COALESCE(EXCLUDED.last_weekly_report_at, users.last_weekly_report_at),
         daily_reminders_enabled = COALESCE(EXCLUDED.daily_reminders_enabled, users.daily_reminders_enabled),
         last_daily_reminder_at = COALESCE(EXCLUDED.last_daily_reminder_at, users.last_daily_reminder_at)
       RETURNING *`,
      [
        profile.telegramId,
        profile.firstName ?? existing?.firstName ?? null,
        profile.languageCode ?? existing?.languageCode ?? null,
        profile.referredBy ?? existing?.referredBy ?? null,
        profile.goal?.type ?? existing?.goal?.type ?? null,
        profile.currentWeightKg ?? existing?.currentWeightKg ?? null,
        profile.goal?.targetWeightKg ?? profile.targetWeightKg ?? existing?.goal?.targetWeightKg ?? existing?.targetWeightKg ?? null,
        profile.heightCm ?? existing?.heightCm ?? null,
        profile.age ?? existing?.age ?? null,
        profile.activityLevel ?? existing?.activityLevel ?? null,
        profile.goal?.dailyCalories ?? existing?.goal?.dailyCalories ?? null,
        profile.proteinGoalG ?? existing?.proteinGoalG ?? null,
        profile.fatGoalG ?? existing?.fatGoalG ?? null,
        profile.carbsGoalG ?? existing?.carbsGoalG ?? null,
        profile.onboardingStep ?? existing?.onboardingStep ?? null,
        profile.onboardingComplete ?? existing?.onboardingComplete ?? false,
        profile.subscriptionPlan ?? existing?.subscriptionPlan ?? "free",
        profile.premium ?? existing?.premium ?? false,
        profile.premiumPlan ?? existing?.premiumPlan ?? null,
        profile.premiumExpiresAt ?? existing?.premiumExpiresAt ?? null,
        profile.weeklyReportsEnabled ?? existing?.weeklyReportsEnabled ?? true,
        profile.lastWeeklyReportAt ?? existing?.lastWeeklyReportAt ?? null,
        profile.dailyRemindersEnabled ?? existing?.dailyRemindersEnabled ?? true,
        profile.lastDailyReminderAt ?? existing?.lastDailyReminderAt ?? null,
      ],
    );
    return applyPremiumStatus(rowToUser(rows[0]));
  }

  async setGoal(telegramId: number, goal: UserGoal): Promise<UserProfile> {
    return this.upsertUser({ telegramId, goal, onboardingComplete: true });
  }

  async setWeeklyReportsEnabled(telegramId: number, enabled: boolean): Promise<UserProfile> {
    return this.upsertUser({ telegramId, weeklyReportsEnabled: enabled });
  }

  async addMeal(meal: MealEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO meals (
         id, user_id, dish_name, calories, protein_g, fat_g, carbs_g,
         advice, photo_file_id, usda_fdc_id, calories_source, micronutrients, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        meal.id,
        meal.userId,
        meal.dishName,
        meal.calories,
        meal.macros.proteinG,
        meal.macros.fatG,
        meal.macros.carbsG,
        meal.advice ?? null,
        meal.photoFileId ?? null,
        meal.usdaFdcId ?? null,
        meal.caloriesSource ?? "ai",
        meal.micronutrients ? JSON.stringify(meal.micronutrients) : null,
        meal.createdAt,
      ],
    );
  }

  async getMealsForDate(userId: number, date: string): Promise<MealEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM meals
       WHERE user_id = $1 AND (created_at AT TIME ZONE 'UTC')::date = $2::date
       ORDER BY created_at ASC`,
      [userId, date],
    );
    return rows.map(rowToMeal);
  }

  async getMealsBetween(userId: number, from: string, to: string): Promise<MealEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM meals
       WHERE user_id = $1
         AND (created_at AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
       ORDER BY created_at ASC`,
      [userId, from, to],
    );
    return rows.map(rowToMeal);
  }

  async getDayStats(
    userId: number,
    date: string,
    options?: { includeMicronutrients?: boolean },
  ): Promise<DayStats> {
    const meals = await this.getMealsForDate(userId, date);
    const user = await this.getUser(userId);
    const includeMicro = options?.includeMicronutrients && isPremiumActive(user);
    return buildDayStats(meals, date, user?.goal, includeMicro);
  }

  async getWeekStats(userId: number, endDate?: string) {
    const end = endDate ?? new Date().toISOString().slice(0, 10);
    const start = shiftDate(end, -6);
    const meals = await this.getMealsBetween(userId, start, end);
    const user = await this.getUser(userId);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getMonthStats(userId: number, endDate?: string): Promise<MonthStats> {
    const end = endDate ?? new Date().toISOString().slice(0, 10);
    const start = shiftDate(end, -29);
    const meals = await this.getMealsBetween(userId, start, end);
    const user = await this.getUser(userId);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getUsersDueWeeklyReport(weekStart: string): Promise<number[]> {
    const weekEnd = shiftDate(weekStart, 6);
    const { rows } = await this.pool.query(
      `SELECT u.telegram_id
       FROM users u
       WHERE u.onboarding_complete = TRUE
         AND COALESCE(u.weekly_reports_enabled, TRUE) = TRUE
         AND (u.last_weekly_report_at IS NULL OR u.last_weekly_report_at < $1::timestamptz)
         AND EXISTS (
           SELECT 1 FROM meals m
           WHERE m.user_id = u.telegram_id
             AND (m.created_at AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
         )`,
      [weekStart + "T00:00:00Z", weekStart, weekEnd],
    );
    return rows.map((r) => Number(r.telegram_id));
  }

  async markWeeklyReportSent(telegramId: number): Promise<void> {
    await this.pool.query(
      `UPDATE users SET last_weekly_report_at = NOW() WHERE telegram_id = $1`,
      [telegramId],
    );
  }

  async getUsersDueDailyReminder(date: string): Promise<number[]> {
    const { rows } = await this.pool.query(
      `SELECT telegram_id
       FROM users
       WHERE COALESCE(daily_reminders_enabled, TRUE) = TRUE
         AND (last_daily_reminder_at IS NULL OR (last_daily_reminder_at AT TIME ZONE 'UTC')::date < $1::date)`,
      [date],
    );
    return rows.map((r) => Number(r.telegram_id));
  }

  async markDailyReminderSent(telegramId: number): Promise<void> {
    await this.pool.query(
      `UPDATE users SET last_daily_reminder_at = NOW() WHERE telegram_id = $1`,
      [telegramId],
    );
  }

  async addWeightEntry(entry: WeightEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO weight_entries (id, user_id, weight_kg, created_at) VALUES ($1, $2, $3, $4)`,
      [entry.id, entry.userId, entry.weightKg, entry.createdAt],
    );
  }

  async getWeightHistory(userId: number, days = 30): Promise<WeightHistory> {
    const from = shiftDate(new Date().toISOString().slice(0, 10), -days);
    const { rows } = await this.pool.query(
      `SELECT * FROM weight_entries
       WHERE user_id = $1 AND (created_at AT TIME ZONE 'UTC')::date >= $2::date
       ORDER BY created_at ASC`,
      [userId, from],
    );
    const entries = rows.map((r) => ({
      id: String(r.id),
      userId: Number(r.user_id),
      weightKg: Number(r.weight_kg),
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
    const latest = entries[entries.length - 1];
    const first = entries[0];
    const changeKg =
      latest && first && entries.length > 1
        ? Math.round((latest.weightKg - first.weightKg) * 10) / 10
        : undefined;
    return { entries, latest, changeKg };
  }

  async recordPayment(payment: PaymentRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO payments (
         id, user_id, telegram_payment_charge_id, provider_payment_charge_id,
         payload, plan, stars, currency, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        payment.id,
        payment.userId,
        payment.telegramPaymentChargeId ?? null,
        payment.providerPaymentChargeId ?? null,
        payment.payload,
        payment.plan,
        payment.stars,
        payment.currency,
        payment.createdAt,
      ],
    );
  }

  async getAdminMetrics(): Promise<AdminMetrics> {
    const { rows } = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM users WHERE COALESCE(subscription_plan, 'free') = 'free') AS free_users,
         (SELECT COUNT(*) FROM users WHERE premium = TRUE) AS premium_users,
         (SELECT COUNT(*) FROM users WHERE premium = TRUE AND premium_expires_at > NOW()) AS active_subscriptions,
         (SELECT COALESCE(SUM(stars), 0) FROM payments) AS total_stars,
         (SELECT COUNT(*) FROM payments) AS payments_count,
         (SELECT COUNT(*) FROM meals) AS meals_count,
         (SELECT COUNT(*) FROM weight_entries) AS weights_count,
         (SELECT COUNT(*) FROM referrals) AS referrals_count,
         (SELECT COALESCE(SUM(scans_today), 0) FROM users WHERE last_usage_date = CURRENT_DATE::text) AS scans_today,
         (SELECT COALESCE(SUM(ai_messages_today), 0) FROM users WHERE last_usage_date = CURRENT_DATE::text) AS ai_messages_today`,
    );
    const row = rows[0] as Record<string, unknown>;
    return {
      totalUsers: Number(row.total_users),
      freeUsers: Number(row.free_users),
      premiumUsers: Number(row.premium_users),
      conversionRate: Number(row.total_users) > 0 ? Math.round((Number(row.premium_users) / Number(row.total_users)) * 1000) / 10 : 0,
      activeSubscriptions: Number(row.active_subscriptions),
      totalStars: Number(row.total_stars),
      paymentsCount: Number(row.payments_count),
      mealsCount: Number(row.meals_count),
      weightsCount: Number(row.weights_count),
      referralsCount: Number(row.referrals_count),
      scansToday: Number(row.scans_today),
      aiMessagesToday: Number(row.ai_messages_today),
    };
  }

  async registerReferral(referrerId: number, referredId: number): Promise<boolean> {
    if (referrerId === referredId) return false;
    const existing = await this.getUser(referredId);
    if (existing?.referredBy) return false;

    const { rowCount } = await this.pool.query(
      `WITH updated AS (
         UPDATE users
         SET referred_by = COALESCE(referred_by, $1)
         WHERE telegram_id = $2 AND referred_by IS NULL
         RETURNING telegram_id
       )
       INSERT INTO referrals (referrer_id, referred_id)
       SELECT $1, $2 FROM updated
       ON CONFLICT (referred_id) DO NOTHING`,
      [referrerId, referredId],
    );
    return (rowCount ?? 0) > 0;
  }

  async getReferralStats(userId: number, botUsername: string): Promise<ReferralStats> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = $1`,
      [userId],
    );
    const user = await this.getUser(userId);
    return {
      referralCode: `https://t.me/${botUsername}?start=ref_${userId}`,
      referralsCount: Number(rows[0]?.count ?? 0),
      referredBy: user?.referredBy,
    };
  }

  async getUsageStatus(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    await this.resetUsageIfNeeded(userId, date);
    const user = await this.getUser(userId);
    const used = user?.lastUsageDate === date ? (kind === "photo_scan" ? user.scansToday : user.aiMessagesToday) : 0;
    return usageStatus(kind, getSubscriptionPlan(user), used ?? 0);
  }

  async incrementUsage(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    const column = kind === "photo_scan" ? "scans_today" : "ai_messages_today";
    await this.pool.query(
      `UPDATE users
       SET scans_today = CASE WHEN last_usage_date = $1 THEN scans_today ELSE 0 END,
           ai_messages_today = CASE WHEN last_usage_date = $1 THEN ai_messages_today ELSE 0 END,
           last_usage_date = $1
       WHERE telegram_id = $2`,
      [date, userId],
    );
    await this.pool.query(`UPDATE users SET ${column} = ${column} + 1 WHERE telegram_id = $1`, [userId]);
    return this.getUsageStatus(userId, kind, date);
  }

  private async resetUsageIfNeeded(userId: number, date: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET scans_today = 0,
           ai_messages_today = 0,
           last_usage_date = $1
       WHERE telegram_id = $2
         AND (last_usage_date IS NULL OR last_usage_date <> $1)`,
      [date, userId],
    );
  }
}

function usageStatus(kind: UsageKind, plan: "free" | "premium", used: number): UsageStatus {
  const limit = plan === "premium" ? null : getFreeLimit(kind);
  return {
    kind,
    allowed: limit == null || used < limit,
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    plan,
  };
}
