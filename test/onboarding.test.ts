import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateNutritionTargets,
  isNutritionProfileComplete,
  parseNumberInRange,
} from "../src/services/nutritionGoals.js";

test("validates numeric onboarding input", () => {
  assert.equal(parseNumberInRange("72.5", 30, 300), 72.5);
  assert.equal(parseNumberInRange("72,5", 30, 300), 72.5);
  assert.equal(parseNumberInRange("abc", 30, 300), null);
  assert.equal(parseNumberInRange("20", 30, 300), null);
  assert.equal(parseNumberInRange("301", 30, 300), null);
});

test("calculates nutrition targets for weight loss", () => {
  const targets = calculateNutritionTargets({
    goalType: "lose",
    currentWeightKg: 82,
    targetWeightKg: 75,
    heightCm: 178,
    age: 32,
    activityLevel: "medium",
  });

  assert.ok(targets.dailyCalories >= 1200);
  assert.ok(targets.proteinGoalG > 120);
  assert.ok(targets.fatGoalG > 30);
  assert.ok(targets.carbsGoalG > 0);
});

test("higher activity increases calories", () => {
  const base = {
    goalType: "maintain" as const,
    currentWeightKg: 70,
    targetWeightKg: 70,
    heightCm: 170,
    age: 30,
  };
  const low = calculateNutritionTargets({ ...base, activityLevel: "low" });
  const high = calculateNutritionTargets({ ...base, activityLevel: "high" });
  assert.ok(high.dailyCalories > low.dailyCalories);
});

test("does not treat legacy goal-only users as fully onboarded", () => {
  assert.equal(
    isNutritionProfileComplete({
      telegramId: 1,
      goal: { type: "lose", dailyCalories: 1800 },
      onboardingComplete: true,
      subscriptionPlan: "free",
      premium: false,
      weeklyReportsEnabled: true,
      dailyRemindersEnabled: true,
      scansToday: 0,
      aiMessagesToday: 0,
      createdAt: new Date().toISOString(),
    }),
    false,
  );
});

test("treats completed nutrition profile as onboarded", () => {
  assert.equal(
    isNutritionProfileComplete({
      telegramId: 1,
      goal: { type: "lose", dailyCalories: 1800, targetWeightKg: 70 },
      currentWeightKg: 80,
      targetWeightKg: 70,
      heightCm: 175,
      age: 30,
      activityLevel: "medium",
      proteinGoalG: 150,
      fatGoalG: 60,
      carbsGoalG: 180,
      onboardingComplete: true,
      onboardingStep: "complete",
      subscriptionPlan: "free",
      premium: false,
      weeklyReportsEnabled: true,
      dailyRemindersEnabled: true,
      scansToday: 0,
      aiMessagesToday: 0,
      createdAt: new Date().toISOString(),
    }),
    true,
  );
});
