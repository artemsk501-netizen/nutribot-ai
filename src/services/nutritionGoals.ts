import type { ActivityLevel, GoalType, UserProfile } from "../types/index.js";

export interface NutritionTargets {
  dailyCalories: number;
  proteinGoalG: number;
  fatGoalG: number;
  carbsGoalG: number;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  low: 1.25,
  medium: 1.45,
  high: 1.7,
};

export function calculateNutritionTargets(input: {
  goalType: GoalType;
  currentWeightKg: number;
  targetWeightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
}): NutritionTargets {
  // Mifflin-St Jeor without gender: use a neutral midpoint between male/female constants.
  const bmr = 10 * input.currentWeightKg + 6.25 * input.heightCm - 5 * input.age - 80;
  const maintenance = bmr * ACTIVITY_MULTIPLIER[input.activityLevel];
  const goalAdjustment =
    input.goalType === "lose" ? -0.15 : input.goalType === "gain" ? 0.12 : 0;
  const dailyCalories = clamp(Math.round(maintenance * (1 + goalAdjustment)), 1200, 4500);

  const proteinPerKg = input.goalType === "gain" ? 1.8 : input.goalType === "lose" ? 1.9 : 1.6;
  const proteinGoalG = Math.round(input.currentWeightKg * proteinPerKg);
  const fatGoalG = Math.round((dailyCalories * 0.3) / 9);
  const carbsGoalG = Math.max(0, Math.round((dailyCalories - proteinGoalG * 4 - fatGoalG * 9) / 4));

  return { dailyCalories, proteinGoalG, fatGoalG, carbsGoalG };
}

export function canCalculateTargets(user?: UserProfile): user is UserProfile & {
  goal: NonNullable<UserProfile["goal"]>;
  currentWeightKg: number;
  targetWeightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
} {
  return Boolean(
    user?.goal?.type &&
      user.currentWeightKg &&
      user.targetWeightKg &&
      user.heightCm &&
      user.age &&
      user.activityLevel,
  );
}

export function isNutritionProfileComplete(user?: UserProfile): boolean {
  return Boolean(
    user?.onboardingComplete &&
      canCalculateTargets(user) &&
      user.goal.dailyCalories > 0 &&
      user.proteinGoalG &&
      user.fatGoalG &&
      user.carbsGoalG,
  );
}

export function parseNumberInRange(text: string, min: number, max: number): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
