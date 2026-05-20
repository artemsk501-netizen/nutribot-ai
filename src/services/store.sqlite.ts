import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AdminMetrics,
  DayStats,
  MealEntry,
  MonthStats,
  PaymentRecord,
  ReferralStats,
  UsageKind,
  UsageStatus,
  UserGoal,
  UserProfile,
  WaterDayStats,
  WaterLogEntry,
  WaterSettings,
  WeightEntry,
  WeightHistory,
} from "../types/index.js";
import { getFreeLimit, getSubscriptionPlan } from "./usageLimits.js";
import { shiftDate, todayISO } from "../utils/date.js";
import type { Store } from "./store.interface.js";
import { applyPremiumStatus, isPremiumActive } from "./premium.js";
import { rowToMeal, rowToUser } from "./store.mappers.js";
import { buildDayStats, buildWeekStats } from "./statsUtils.js";

export class SqliteStore implements Store {
  constructor(private db: DatabaseSync) {}

  async getUser(telegramId: number): Promise<UserProfile | undefined> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(telegramId) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    const user = applyPremiumStatus(rowToUser(row));
    if (row.premium && !user.premium) {
      this.db
        .prepare("UPDATE users SET subscription_plan = 'free', premium = 0, premium_plan = NULL, premium_expires_at = NULL WHERE telegram_id = ?")
        .run(telegramId);
    }
    return user;
  }

  async upsertUser(profile: Partial<UserProfile> & { telegramId: number }): Promise<UserProfile> {
    const existing = await this.getUser(profile.telegramId);
    const onboarding = profile.onboardingComplete ?? existing?.onboardingComplete ?? false;
    const premium = profile.premium ?? existing?.premium ?? false;
    const weeklyEnabled = profile.weeklyReportsEnabled ?? existing?.weeklyReportsEnabled ?? true;
    const dailyEnabled = profile.dailyRemindersEnabled ?? existing?.dailyRemindersEnabled ?? true;

    this.db
      .prepare(
        `INSERT INTO users (
           telegram_id, first_name, language_code, locale, referred_by, goal_type, current_weight_kg,
           target_weight_kg, height_cm, age, activity_level, daily_calories,
           protein_goal_g, fat_goal_g, carbs_goal_g, onboarding_step,
           onboarding_complete, subscription_plan, premium, premium_plan, premium_expires_at,
           weekly_reports_enabled, last_weekly_report_at, daily_reminders_enabled, last_daily_reminder_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (telegram_id) DO UPDATE SET
           first_name = COALESCE(excluded.first_name, users.first_name),
           language_code = COALESCE(excluded.language_code, users.language_code),
           locale = COALESCE(excluded.locale, users.locale),
           referred_by = COALESCE(excluded.referred_by, users.referred_by),
           goal_type = COALESCE(excluded.goal_type, users.goal_type),
           current_weight_kg = COALESCE(excluded.current_weight_kg, users.current_weight_kg),
           target_weight_kg = COALESCE(excluded.target_weight_kg, users.target_weight_kg),
           height_cm = COALESCE(excluded.height_cm, users.height_cm),
           age = COALESCE(excluded.age, users.age),
           activity_level = COALESCE(excluded.activity_level, users.activity_level),
           daily_calories = COALESCE(excluded.daily_calories, users.daily_calories),
           protein_goal_g = COALESCE(excluded.protein_goal_g, users.protein_goal_g),
           fat_goal_g = COALESCE(excluded.fat_goal_g, users.fat_goal_g),
           carbs_goal_g = COALESCE(excluded.carbs_goal_g, users.carbs_goal_g),
           onboarding_step = COALESCE(excluded.onboarding_step, users.onboarding_step),
           onboarding_complete = COALESCE(excluded.onboarding_complete, users.onboarding_complete),
           subscription_plan = COALESCE(excluded.subscription_plan, users.subscription_plan),
           premium = COALESCE(excluded.premium, users.premium),
           premium_plan = COALESCE(excluded.premium_plan, users.premium_plan),
           premium_expires_at = COALESCE(excluded.premium_expires_at, users.premium_expires_at),
           weekly_reports_enabled = COALESCE(excluded.weekly_reports_enabled, users.weekly_reports_enabled),
           last_weekly_report_at = COALESCE(excluded.last_weekly_report_at, users.last_weekly_report_at),
           daily_reminders_enabled = COALESCE(excluded.daily_reminders_enabled, users.daily_reminders_enabled),
           last_daily_reminder_at = COALESCE(excluded.last_daily_reminder_at, users.last_daily_reminder_at)`,
      )
      .run(
        profile.telegramId,
        profile.firstName ?? existing?.firstName ?? null,
        profile.languageCode ?? existing?.languageCode ?? null,
        profile.locale ?? existing?.locale ?? null,
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
        onboarding ? 1 : 0,
        profile.subscriptionPlan ?? existing?.subscriptionPlan ?? "free",
        premium ? 1 : 0,
        profile.premiumPlan ?? existing?.premiumPlan ?? null,
        profile.premiumExpiresAt ?? existing?.premiumExpiresAt ?? null,
        weeklyEnabled ? 1 : 0,
        profile.lastWeeklyReportAt ?? existing?.lastWeeklyReportAt ?? null,
        dailyEnabled ? 1 : 0,
        profile.lastDailyReminderAt ?? existing?.lastDailyReminderAt ?? null,
      );

    return (await this.getUser(profile.telegramId))!;
  }

  async setGoal(telegramId: number, goal: UserGoal): Promise<UserProfile> {
    return this.upsertUser({ telegramId, goal, onboardingComplete: true });
  }

  async setWeeklyReportsEnabled(telegramId: number, enabled: boolean): Promise<UserProfile> {
    return this.upsertUser({ telegramId, weeklyReportsEnabled: enabled });
  }

  async addMeal(meal: MealEntry): Promise<void> {
    const date = meal.createdAt.slice(0, 10);

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO meals (
             id, user_id, dish_name, calories, protein_g, fat_g, carbs_g,
             advice, photo_file_id, usda_fdc_id, calories_source, micronutrients,
             grams, portion_size, confidence, calories_per_100g, protein_per_100g,
             fat_per_100g, carbs_per_100g, source, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
          meal.grams ?? null,
          meal.portionSize ?? null,
          meal.confidence ?? null,
          meal.caloriesPer100g ?? null,
          meal.proteinPer100g ?? null,
          meal.fatPer100g ?? null,
          meal.carbsPer100g ?? null,
          meal.source ?? "ai",
          meal.createdAt,
        );

      this.db
        .prepare(
          `INSERT INTO daily_stats (user_id, date, total_calories, protein_g, fat_g, carbs_g, meal_count, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
           ON CONFLICT (user_id, date) DO UPDATE SET
             total_calories = total_calories + excluded.total_calories,
             protein_g = protein_g + excluded.protein_g,
             fat_g = fat_g + excluded.fat_g,
             carbs_g = carbs_g + excluded.carbs_g,
             meal_count = meal_count + 1,
             updated_at = datetime('now')`,
        )
        .run(
          meal.userId,
          date,
          meal.calories,
          meal.macros.proteinG,
          meal.macros.fatG,
          meal.macros.carbsG,
        );

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async getMealsForDate(userId: number, date: string): Promise<MealEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM meals
         WHERE user_id = ? AND substr(created_at, 1, 10) = ?
         ORDER BY created_at ASC`,
      )
      .all(userId, date) as Record<string, unknown>[];
    return rows.map(rowToMeal);
  }

  async getMealsBetween(userId: number, from: string, to: string): Promise<MealEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM meals
         WHERE user_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ?
         ORDER BY created_at ASC`,
      )
      .all(userId, from, to) as Record<string, unknown>[];
    return rows.map(rowToMeal);
  }

  async getDayStats(
    userId: number,
    date: string,
    options?: { includeMicronutrients?: boolean },
  ): Promise<DayStats> {
    const meals = await this.getMealsForDate(userId, date);
    const user = await this.getUser(userId);
    return buildDayStats(meals, date, user?.goal, options?.includeMicronutrients && isPremiumActive(user));
  }

  async getWeekStats(userId: number, endDate?: string) {
    const end = endDate ?? todayISO();
    const start = shiftDate(end, -6);
    const meals = await this.getMealsBetween(userId, start, end);
    const user = await this.getUser(userId);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getMonthStats(userId: number, endDate?: string): Promise<MonthStats> {
    const end = endDate ?? todayISO();
    const start = shiftDate(end, -29);
    const meals = await this.getMealsBetween(userId, start, end);
    const user = await this.getUser(userId);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getUsersDueWeeklyReport(weekStart: string): Promise<number[]> {
    const weekEnd = shiftDate(weekStart, 6);
    const weekStartTs = weekStart + "T00:00:00.000Z";

    const rows = this.db
      .prepare(
        `SELECT u.telegram_id
         FROM users u
         WHERE u.onboarding_complete = 1
           AND u.weekly_reports_enabled = 1
           AND (u.last_weekly_report_at IS NULL OR u.last_weekly_report_at < ?)
           AND EXISTS (
             SELECT 1 FROM meals m
             WHERE m.user_id = u.telegram_id
               AND substr(m.created_at, 1, 10) BETWEEN ? AND ?
           )`,
      )
      .all(weekStartTs, weekStart, weekEnd) as { telegram_id: number }[];

    return rows.map((r) => Number(r.telegram_id));
  }

  async markWeeklyReportSent(telegramId: number): Promise<void> {
    this.db
      .prepare(`UPDATE users SET last_weekly_report_at = datetime('now') WHERE telegram_id = ?`)
      .run(telegramId);
  }

  async getUsersDueDailyReminder(date: string): Promise<number[]> {
    const rows = this.db
      .prepare(
        `SELECT telegram_id
         FROM users
         WHERE daily_reminders_enabled = 1
           AND (last_daily_reminder_at IS NULL OR substr(last_daily_reminder_at, 1, 10) < ?)`,
      )
      .all(date) as { telegram_id: number }[];

    return rows.map((r) => Number(r.telegram_id));
  }

  async markDailyReminderSent(telegramId: number): Promise<void> {
    this.db
      .prepare(`UPDATE users SET last_daily_reminder_at = datetime('now') WHERE telegram_id = ?`)
      .run(telegramId);
  }

  async addWeightEntry(entry: WeightEntry): Promise<void> {
    this.db
      .prepare(`INSERT INTO weight_entries (id, user_id, weight_kg, created_at) VALUES (?, ?, ?, ?)`)
      .run(entry.id, entry.userId, entry.weightKg, entry.createdAt);
  }

  async getWeightHistory(userId: number, days = 30): Promise<WeightHistory> {
    const from = shiftDate(todayISO(), -days);
    const rows = this.db
      .prepare(
        `SELECT * FROM weight_entries
         WHERE user_id = ? AND substr(created_at, 1, 10) >= ?
         ORDER BY created_at ASC`,
      )
      .all(userId, from) as Record<string, unknown>[];

    const entries = rows.map((r) => ({
      id: String(r.id),
      userId: Number(r.user_id),
      weightKg: Number(r.weight_kg),
      createdAt: String(r.created_at),
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
    this.db
      .prepare(
        `INSERT INTO payments (
           id, user_id, telegram_payment_charge_id, provider_payment_charge_id,
           payload, plan, stars, currency, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payment.id,
        payment.userId,
        payment.telegramPaymentChargeId ?? null,
        payment.providerPaymentChargeId ?? null,
        payment.payload,
        payment.plan,
        payment.stars,
        payment.currency,
        payment.createdAt,
      );
  }

  async getAdminMetrics(): Promise<AdminMetrics> {
    const row = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS totalUsers,
           (SELECT COUNT(*) FROM users WHERE COALESCE(subscription_plan, 'free') = 'free') AS freeUsers,
           (SELECT COUNT(*) FROM users WHERE premium = 1) AS premiumUsers,
           (SELECT COUNT(*) FROM users WHERE premium = 1 AND premium_expires_at > datetime('now')) AS activeSubscriptions,
           (SELECT COALESCE(SUM(stars), 0) FROM payments) AS totalStars,
           (SELECT COUNT(*) FROM payments) AS paymentsCount,
           (SELECT COUNT(*) FROM meals) AS mealsCount,
           (SELECT COUNT(*) FROM weight_entries) AS weightsCount,
           (SELECT COUNT(*) FROM referrals) AS referralsCount,
           (SELECT COALESCE(SUM(scans_today), 0) FROM users WHERE last_usage_date = date('now')) AS scansToday,
           (SELECT COALESCE(SUM(ai_messages_today), 0) FROM users WHERE last_usage_date = date('now')) AS aiMessagesToday`,
      )
      .get() as Record<string, unknown>;

    return {
      totalUsers: Number(row.totalUsers),
      freeUsers: Number(row.freeUsers),
      premiumUsers: Number(row.premiumUsers),
      conversionRate: Number(row.totalUsers) > 0 ? Math.round((Number(row.premiumUsers) / Number(row.totalUsers)) * 1000) / 10 : 0,
      activeSubscriptions: Number(row.activeSubscriptions),
      totalStars: Number(row.totalStars),
      paymentsCount: Number(row.paymentsCount),
      mealsCount: Number(row.mealsCount),
      weightsCount: Number(row.weightsCount),
      referralsCount: Number(row.referralsCount),
      scansToday: Number(row.scansToday),
      aiMessagesToday: Number(row.aiMessagesToday),
    };
  }

  async registerReferral(referrerId: number, referredId: number): Promise<boolean> {
    if (referrerId === referredId) return false;
    const existing = await this.getUser(referredId);
    if (existing?.referredBy) return false;

    try {
      this.db.exec("BEGIN");
      this.db
        .prepare("UPDATE users SET referred_by = COALESCE(referred_by, ?) WHERE telegram_id = ? AND referred_by IS NULL")
        .run(referrerId, referredId);
      const changes = this.db
        .prepare(
          `INSERT OR IGNORE INTO referrals (id, referrer_id, referred_id, reward_granted, created_at)
           VALUES (?, ?, ?, 0, datetime('now'))`,
        )
        .run(randomUUID(), referrerId, referredId).changes;
      this.db.exec("COMMIT");
      return changes > 0;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async getReferralStats(userId: number, botUsername: string): Promise<ReferralStats> {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = ?")
      .get(userId) as { count: number };
    const user = await this.getUser(userId);
    return {
      referralCode: `https://t.me/${botUsername}?start=ref_${userId}`,
      referralsCount: Number(row.count),
      referredBy: user?.referredBy,
    };
  }

  async getUsageStatus(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    this.resetUsageIfNeeded(userId, date);
    const user = await this.getUser(userId);
    if (!user) {
      return usageStatus(kind, "free", 0);
    }
    return usageStatus(kind, getSubscriptionPlan(user), usageCount(user, kind, date));
  }

  async incrementUsage(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    const column = kind === "photo_scan" ? "scans_today" : "ai_messages_today";
    this.db
      .prepare(
        `UPDATE users
         SET scans_today = CASE WHEN last_usage_date = ? THEN scans_today ELSE 0 END,
             ai_messages_today = CASE WHEN last_usage_date = ? THEN ai_messages_today ELSE 0 END,
             last_usage_date = ?
         WHERE telegram_id = ?`,
      )
      .run(date, date, date, userId);

    this.db.prepare(`UPDATE users SET ${column} = ${column} + 1 WHERE telegram_id = ?`).run(userId);
    return this.getUsageStatus(userId, kind, date);
  }

  async setWaterSettings(userId: number, settings: Partial<WaterSettings>): Promise<UserProfile> {
    const user = await this.getUser(userId);
    const w = { ...user?.water, ...settings };
    this.db
      .prepare(
        `UPDATE users SET
           water_reminders_enabled = ?,
           water_goal_ml = ?,
           water_interval_hours = ?,
           water_quiet_start = ?,
           water_quiet_end = ?,
           water_last_reminder_at = ?,
           water_reminders_today = ?,
           water_reminders_date = ?,
           water_last_activity_at = ?
         WHERE telegram_id = ?`,
      )
      .run(
        w.remindersEnabled ? 1 : 0,
        w.goalMl ?? 2000,
        w.intervalHours ?? 3,
        w.quietStart ?? "22:00",
        w.quietEnd ?? "09:00",
        w.lastReminderAt ?? null,
        w.remindersToday ?? 0,
        w.remindersDate ?? null,
        w.lastActivityAt ?? null,
        userId,
      );
    return (await this.getUser(userId))!;
  }

  async addWaterLog(entry: WaterLogEntry): Promise<void> {
    this.db
      .prepare("INSERT INTO water_logs (id, user_id, amount_ml, created_at) VALUES (?, ?, ?, ?)")
      .run(entry.id, entry.userId, entry.amountMl, entry.createdAt);
  }

  async getWaterDayStats(userId: number, date: string): Promise<WaterDayStats> {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_ml), 0) AS total, COUNT(*) AS cnt
         FROM water_logs
         WHERE user_id = ? AND substr(created_at, 1, 10) = ?`,
      )
      .get(userId, date) as { total: number; cnt: number };
    const user = await this.getUser(userId);
    const goalMl = user?.water?.goalMl ?? 2000;
    return {
      date,
      totalMl: Number(row.total),
      goalMl,
      logCount: Number(row.cnt),
    };
  }

  async getUsersDueWaterReminder(nowIso: string): Promise<number[]> {
    const date = nowIso.slice(0, 10);
    const rows = this.db
      .prepare(
        `SELECT telegram_id, water_goal_ml, water_interval_hours, water_quiet_start, water_quiet_end,
                water_last_reminder_at, water_reminders_today, water_reminders_date, water_last_activity_at
         FROM users
         WHERE water_reminders_enabled = 1 AND onboarding_complete = 1`,
      )
      .all() as Array<Record<string, unknown>>;

    const due: number[] = [];
    for (const row of rows) {
      const userId = Number(row.telegram_id);
      const settings: WaterSettings = {
        remindersEnabled: true,
        goalMl: Number(row.water_goal_ml ?? 2000),
        intervalHours: Number(row.water_interval_hours ?? 3),
        quietStart: String(row.water_quiet_start ?? "22:00"),
        quietEnd: String(row.water_quiet_end ?? "09:00"),
        lastReminderAt: row.water_last_reminder_at ? String(row.water_last_reminder_at) : undefined,
        remindersToday: Number(row.water_reminders_today ?? 0),
        remindersDate: row.water_reminders_date ? String(row.water_reminders_date) : undefined,
        lastActivityAt: row.water_last_activity_at ? String(row.water_last_activity_at) : undefined,
      };
      if (isDueWaterReminder(settings, nowIso, date)) due.push(userId);
    }
    return due;
  }

  async markWaterReminderSent(userId: number, nowIso: string): Promise<void> {
    const date = nowIso.slice(0, 10);
    const user = await this.getUser(userId);
    const todayCount =
      user?.water?.remindersDate === date ? (user.water?.remindersToday ?? 0) + 1 : 1;
    await this.setWaterSettings(userId, {
      lastReminderAt: nowIso,
      remindersToday: todayCount,
      remindersDate: date,
    });
  }

  async touchWaterActivity(userId: number, nowIso: string): Promise<void> {
    await this.setWaterSettings(userId, { lastActivityAt: nowIso });
  }

  private resetUsageIfNeeded(userId: number, date: string): void {
    this.db
      .prepare(
        `UPDATE users
         SET scans_today = 0,
             ai_messages_today = 0,
             last_usage_date = ?
         WHERE telegram_id = ?
           AND (last_usage_date IS NULL OR last_usage_date <> ?)`,
      )
      .run(date, userId, date);
  }
}

function usageCount(user: UserProfile, kind: UsageKind, date: string): number {
  if (user.lastUsageDate !== date) return 0;
  return kind === "photo_scan" ? user.scansToday : user.aiMessagesToday;
}

function isDueWaterReminder(settings: WaterSettings, nowIso: string, date: string): boolean {
  const { isInQuietHours, hoursSince, daysSinceActivity } = waterTimeHelpers(settings, nowIso);
  if (isInQuietHours) return false;
  if (settings.remindersDate === date && (settings.remindersToday ?? 0) >= 5) return false;
  if (settings.lastActivityAt && daysSinceActivity(settings.lastActivityAt, nowIso) > 3) return false;
  if (!settings.lastReminderAt) return true;
  return hoursSince(settings.lastReminderAt, nowIso) >= settings.intervalHours;
}

function waterTimeHelpers(settings: WaterSettings, nowIso: string) {
  const now = new Date(nowIso);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [qsH, qsM] = settings.quietStart.split(":").map(Number);
  const [qeH, qeM] = settings.quietEnd.split(":").map(Number);
  const start = qsH * 60 + qsM;
  const end = qeH * 60 + qeM;
  const isInQuietHours = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
  const hoursSince = (iso: string, nowStr: string) =>
    (new Date(nowStr).getTime() - new Date(iso).getTime()) / (3600 * 1000);
  const daysSinceActivity = (iso: string, nowStr: string) =>
    (new Date(nowStr).getTime() - new Date(iso).getTime()) / (86400 * 1000);
  return { isInQuietHours, hoursSince, daysSinceActivity };
}

function usageStatus(kind: UsageKind, plan: "free" | "premium", used: number): UsageStatus {
  const limit = plan === "premium" ? null : getFreeLimit(kind);
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return {
    kind,
    allowed: limit == null || used < limit,
    used,
    limit,
    remaining,
    plan,
  };
}
