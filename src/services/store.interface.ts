import type {
  DayStats,
  AdminMetrics,
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
  WeekStats,
  WeightEntry,
  WeightHistory,
} from "../types/index.js";

export interface Store {
  getUser(telegramId: number): Promise<UserProfile | undefined>;
  upsertUser(profile: Partial<UserProfile> & { telegramId: number }): Promise<UserProfile>;
  setGoal(telegramId: number, goal: UserGoal): Promise<UserProfile>;
  setWeeklyReportsEnabled(telegramId: number, enabled: boolean): Promise<UserProfile>;
  addMeal(meal: MealEntry): Promise<void>;
  getMealsForDate(userId: number, date: string): Promise<MealEntry[]>;
  getMealsBetween(userId: number, from: string, to: string): Promise<MealEntry[]>;
  getDayStats(userId: number, date: string, options?: { includeMicronutrients?: boolean }): Promise<DayStats>;
  getWeekStats(userId: number, endDate?: string): Promise<WeekStats>;
  getMonthStats(userId: number, endDate?: string): Promise<MonthStats>;
  getUsersDueWeeklyReport(weekStart: string): Promise<number[]>;
  markWeeklyReportSent(telegramId: number): Promise<void>;
  getUsersDueDailyReminder(date: string): Promise<number[]>;
  markDailyReminderSent(telegramId: number): Promise<void>;
  addWeightEntry(entry: WeightEntry): Promise<void>;
  getWeightHistory(userId: number, days?: number): Promise<WeightHistory>;
  recordPayment(payment: PaymentRecord): Promise<void>;
  getAdminMetrics(): Promise<AdminMetrics>;
  registerReferral(referrerId: number, referredId: number): Promise<boolean>;
  getReferralStats(userId: number, botUsername: string): Promise<ReferralStats>;
  getUsageStatus(userId: number, kind: UsageKind, date: string): Promise<UsageStatus>;
  incrementUsage(userId: number, kind: UsageKind, date: string): Promise<UsageStatus>;
  setWaterSettings(userId: number, settings: Partial<WaterSettings>): Promise<UserProfile>;
  addWaterLog(entry: WaterLogEntry): Promise<void>;
  getWaterDayStats(userId: number, date: string): Promise<WaterDayStats>;
  getUsersDueWaterReminder(nowIso: string): Promise<number[]>;
  markWaterReminderSent(userId: number, nowIso: string): Promise<void>;
  touchWaterActivity(userId: number, nowIso: string): Promise<void>;
}
