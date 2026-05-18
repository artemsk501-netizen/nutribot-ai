import type { AdminMetrics, DayStats, MealEntry, MonthStats, PaymentRecord, ReferralStats, UsageKind, UsageStatus, UserGoal, UserProfile, WeightEntry, WeightHistory } from "../types/index.js";
import type { Store } from "./store.interface.js";
import { applyPremiumStatus, isPremiumActive } from "./premium.js";
import { buildDayStats, buildWeekStats } from "./statsUtils.js";
import { getFreeLimit, getSubscriptionPlan } from "./usageLimits.js";

export class MemoryStore implements Store {
  private users = new Map<number, UserProfile>();
  private meals = new Map<number, MealEntry[]>();
  private weights = new Map<number, WeightEntry[]>();
  private payments: PaymentRecord[] = [];
  private referrals = new Map<number, number>();

  async getUser(telegramId: number): Promise<UserProfile | undefined> {
    const user = this.users.get(telegramId);
    return user ? applyPremiumStatus(user) : undefined;
  }

  async upsertUser(profile: Partial<UserProfile> & { telegramId: number }): Promise<UserProfile> {
    const existing = this.users.get(profile.telegramId);
    const user: UserProfile = applyPremiumStatus({
      telegramId: profile.telegramId,
      firstName: profile.firstName ?? existing?.firstName,
      languageCode: profile.languageCode ?? existing?.languageCode,
      referredBy: profile.referredBy ?? existing?.referredBy,
      goal: profile.goal ?? existing?.goal,
      currentWeightKg: profile.currentWeightKg ?? existing?.currentWeightKg,
      targetWeightKg: profile.targetWeightKg ?? existing?.targetWeightKg,
      heightCm: profile.heightCm ?? existing?.heightCm,
      age: profile.age ?? existing?.age,
      activityLevel: profile.activityLevel ?? existing?.activityLevel,
      proteinGoalG: profile.proteinGoalG ?? existing?.proteinGoalG,
      fatGoalG: profile.fatGoalG ?? existing?.fatGoalG,
      carbsGoalG: profile.carbsGoalG ?? existing?.carbsGoalG,
      onboardingStep: profile.onboardingStep ?? existing?.onboardingStep,
      onboardingComplete: profile.onboardingComplete ?? existing?.onboardingComplete ?? false,
      subscriptionPlan: profile.subscriptionPlan ?? existing?.subscriptionPlan ?? "free",
      premium: profile.premium ?? existing?.premium ?? false,
      premiumPlan: profile.premiumPlan ?? existing?.premiumPlan,
      premiumExpiresAt: profile.premiumExpiresAt ?? existing?.premiumExpiresAt,
      weeklyReportsEnabled:
        profile.weeklyReportsEnabled ?? existing?.weeklyReportsEnabled ?? true,
      lastWeeklyReportAt: profile.lastWeeklyReportAt ?? existing?.lastWeeklyReportAt,
      dailyRemindersEnabled:
        profile.dailyRemindersEnabled ?? existing?.dailyRemindersEnabled ?? true,
      lastDailyReminderAt: profile.lastDailyReminderAt ?? existing?.lastDailyReminderAt,
      scansToday: profile.scansToday ?? existing?.scansToday ?? 0,
      aiMessagesToday: profile.aiMessagesToday ?? existing?.aiMessagesToday ?? 0,
      lastUsageDate: profile.lastUsageDate ?? existing?.lastUsageDate,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    this.users.set(profile.telegramId, user);
    return user;
  }

  async setGoal(telegramId: number, goal: UserGoal): Promise<UserProfile> {
    return this.upsertUser({ telegramId, goal, onboardingComplete: true });
  }

  async setWeeklyReportsEnabled(telegramId: number, enabled: boolean): Promise<UserProfile> {
    return this.upsertUser({ telegramId, weeklyReportsEnabled: enabled });
  }

  async addMeal(meal: MealEntry): Promise<void> {
    const list = this.meals.get(meal.userId) ?? [];
    list.push(meal);
    this.meals.set(meal.userId, list);
  }

  async getMealsForDate(userId: number, date: string): Promise<MealEntry[]> {
    const list = this.meals.get(userId) ?? [];
    return list.filter((m) => m.createdAt.startsWith(date));
  }

  async getMealsBetween(userId: number, from: string, to: string): Promise<MealEntry[]> {
    const list = this.meals.get(userId) ?? [];
    return list.filter((m) => {
      const d = m.createdAt.slice(0, 10);
      return d >= from && d <= to;
    });
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
    const user = await this.getUser(userId);
    const end = endDate ?? new Date().toISOString().slice(0, 10);
    const start = shiftDate(end, -6);
    const meals = await this.getMealsBetween(userId, start, end);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getMonthStats(userId: number, endDate?: string): Promise<MonthStats> {
    const user = await this.getUser(userId);
    const end = endDate ?? new Date().toISOString().slice(0, 10);
    const start = shiftDate(end, -29);
    const meals = await this.getMealsBetween(userId, start, end);
    return buildWeekStats(meals, start, end, user?.goal);
  }

  async getUsersDueWeeklyReport(weekStart: string): Promise<number[]> {
    const weekStartTs = new Date(weekStart + "T00:00:00Z").getTime();
    const due: number[] = [];

    for (const user of this.users.values()) {
      const normalized = applyPremiumStatus(user);
      if (!normalized.onboardingComplete || !normalized.weeklyReportsEnabled) continue;
      const last = normalized.lastWeeklyReportAt
        ? new Date(normalized.lastWeeklyReportAt).getTime()
        : 0;
      if (last >= weekStartTs) continue;

      const meals = await this.getMealsBetween(user.telegramId, weekStart, shiftDate(weekStart, 6));
      if (meals.length === 0) continue;
      due.push(user.telegramId);
    }
    return due;
  }

  async markWeeklyReportSent(telegramId: number): Promise<void> {
    await this.upsertUser({
      telegramId,
      lastWeeklyReportAt: new Date().toISOString(),
    });
  }

  async getUsersDueDailyReminder(date: string): Promise<number[]> {
    const due: number[] = [];
    for (const user of this.users.values()) {
      const normalized = applyPremiumStatus(user);
      if (!normalized.dailyRemindersEnabled) continue;
      if (normalized.lastDailyReminderAt?.startsWith(date)) continue;
      due.push(user.telegramId);
    }
    return due;
  }

  async markDailyReminderSent(telegramId: number): Promise<void> {
    await this.upsertUser({
      telegramId,
      lastDailyReminderAt: new Date().toISOString(),
    });
  }

  async addWeightEntry(entry: WeightEntry): Promise<void> {
    const list = this.weights.get(entry.userId) ?? [];
    list.push(entry);
    this.weights.set(entry.userId, list);
  }

  async getWeightHistory(userId: number, days = 30): Promise<WeightHistory> {
    const from = shiftDate(new Date().toISOString().slice(0, 10), -days);
    const list = (this.weights.get(userId) ?? []).filter((e) => e.createdAt.slice(0, 10) >= from);
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = list[list.length - 1];
    const first = list[0];
    const changeKg =
      latest && first && list.length > 1
        ? Math.round((latest.weightKg - first.weightKg) * 10) / 10
        : undefined;
    return { entries: list, latest, changeKg };
  }

  async recordPayment(payment: PaymentRecord): Promise<void> {
    this.payments.push(payment);
  }

  async getAdminMetrics(): Promise<AdminMetrics> {
    const users = [...this.users.values()].map(applyPremiumStatus);
    return {
      totalUsers: users.length,
      freeUsers: users.filter((u) => getSubscriptionPlan(u) === "free").length,
      premiumUsers: users.filter((u) => u.premium).length,
      conversionRate: users.length > 0 ? Math.round((users.filter((u) => u.premium).length / users.length) * 1000) / 10 : 0,
      activeSubscriptions: users.filter((u) => u.premium).length,
      totalStars: this.payments.reduce((sum, p) => sum + p.stars, 0),
      paymentsCount: this.payments.length,
      mealsCount: [...this.meals.values()].reduce((sum, meals) => sum + meals.length, 0),
      weightsCount: [...this.weights.values()].reduce((sum, weights) => sum + weights.length, 0),
      referralsCount: this.referrals.size,
      scansToday: users.reduce((sum, u) => sum + (u.scansToday ?? 0), 0),
      aiMessagesToday: users.reduce((sum, u) => sum + (u.aiMessagesToday ?? 0), 0),
    };
  }

  async registerReferral(referrerId: number, referredId: number): Promise<boolean> {
    if (referrerId === referredId || this.referrals.has(referredId)) return false;
    this.referrals.set(referredId, referrerId);
    await this.upsertUser({ telegramId: referredId, referredBy: referrerId });
    return true;
  }

  async getReferralStats(userId: number, botUsername: string): Promise<ReferralStats> {
    let referralsCount = 0;
    for (const referrerId of this.referrals.values()) {
      if (referrerId === userId) referralsCount++;
    }
    const user = await this.getUser(userId);
    return {
      referralCode: `https://t.me/${botUsername}?start=ref_${userId}`,
      referralsCount,
      referredBy: user?.referredBy,
    };
  }

  async getUsageStatus(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    const user = await this.getUser(userId);
    if (user && user.lastUsageDate !== date) {
      user.scansToday = 0;
      user.aiMessagesToday = 0;
      user.lastUsageDate = date;
      this.users.set(userId, user);
    }
    const used = user?.lastUsageDate === date ? (kind === "photo_scan" ? user.scansToday : user?.aiMessagesToday) : 0;
    return usageStatus(kind, getSubscriptionPlan(user), used ?? 0);
  }

  async incrementUsage(userId: number, kind: UsageKind, date: string): Promise<UsageStatus> {
    const user = await this.getUser(userId);
    const scans = user?.lastUsageDate === date ? user.scansToday : 0;
    const messages = user?.lastUsageDate === date ? user.aiMessagesToday : 0;
    await this.upsertUser({
      telegramId: userId,
      scansToday: kind === "photo_scan" ? scans + 1 : scans,
      aiMessagesToday: kind === "ai_message" ? messages + 1 : messages,
      lastUsageDate: date,
    });
    return this.getUsageStatus(userId, kind, date);
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

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
