import type { ActivityLevel, MealEntry, Micronutrients, OnboardingStep, SubscriptionPlan, UserGoal, UserProfile } from "../types/index.js";
import { normalizePremiumPlan } from "./premium.js";

export function rowToUser(row: Record<string, unknown>): UserProfile {
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
    activityLevel: normalizeActivity(row.activity_level),
    proteinGoalG: row.protein_goal_g != null ? Number(row.protein_goal_g) : undefined,
    fatGoalG: row.fat_goal_g != null ? Number(row.fat_goal_g) : undefined,
    carbsGoalG: row.carbs_goal_g != null ? Number(row.carbs_goal_g) : undefined,
    onboardingStep: normalizeOnboardingStep(row.onboarding_step),
    onboardingComplete: Boolean(row.onboarding_complete),
    subscriptionPlan: normalizeSubscriptionPlan(row.subscription_plan),
    premium: Boolean(row.premium),
    premiumPlan: normalizePremiumPlan(row.premium_plan),
    premiumExpiresAt: row.premium_expires_at ? String(row.premium_expires_at) : undefined,
    weeklyReportsEnabled: row.weekly_reports_enabled !== 0 && row.weekly_reports_enabled !== false,
    lastWeeklyReportAt: row.last_weekly_report_at ? String(row.last_weekly_report_at) : undefined,
    dailyRemindersEnabled: row.daily_reminders_enabled !== 0 && row.daily_reminders_enabled !== false,
    lastDailyReminderAt: row.last_daily_reminder_at ? String(row.last_daily_reminder_at) : undefined,
    scansToday: row.scans_today != null ? Number(row.scans_today) : 0,
    aiMessagesToday: row.ai_messages_today != null ? Number(row.ai_messages_today) : 0,
    lastUsageDate: row.last_usage_date ? String(row.last_usage_date) : undefined,
    createdAt: String(row.created_at),
  };
}

function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  return value === "premium" ? "premium" : "free";
}

function normalizeActivity(value: unknown): ActivityLevel | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function normalizeOnboardingStep(value: unknown): OnboardingStep | undefined {
  return value === "goal" ||
    value === "current_weight" ||
    value === "target_weight" ||
    value === "height" ||
    value === "age" ||
    value === "activity" ||
    value === "complete"
    ? value
    : undefined;
}

export function rowToMeal(row: Record<string, unknown>): MealEntry {
  const microRaw = row.micronutrients;
  let micronutrients: Micronutrients | undefined;
  if (typeof microRaw === "string" && microRaw) {
    try {
      micronutrients = JSON.parse(microRaw) as Micronutrients;
    } catch {
      micronutrients = undefined;
    }
  } else if (microRaw && typeof microRaw === "object") {
    micronutrients = microRaw as Micronutrients;
  }

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
    micronutrients,
    createdAt: String(row.created_at),
  };
}
