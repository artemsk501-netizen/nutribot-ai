import test from "node:test";
import assert from "node:assert/strict";
import { buildNutritionAssistantPrompt } from "../src/services/aiAssistant.js";
import {
  FREE_DAILY_AI_MESSAGE_LIMIT,
  FREE_DAILY_PHOTO_LIMIT,
  getFreeLimit,
  getSubscriptionPlan,
} from "../src/services/usageLimits.js";
import type { UserProfile } from "../src/types/index.js";

test("free limits are enforced by usage kind", () => {
  assert.equal(getFreeLimit("photo_scan"), FREE_DAILY_PHOTO_LIMIT);
  assert.equal(getFreeLimit("ai_message"), FREE_DAILY_AI_MESSAGE_LIMIT);
});

test("active premium maps to premium subscription access", () => {
  const user: UserProfile = {
    telegramId: 1,
    onboardingComplete: true,
    subscriptionPlan: "free",
    premium: true,
    premiumPlan: "pro",
    premiumExpiresAt: "2999-01-01T00:00:00.000Z",
    weeklyReportsEnabled: true,
    dailyRemindersEnabled: true,
    scansToday: 0,
    aiMessagesToday: 0,
    createdAt: new Date().toISOString(),
  };
  assert.equal(getSubscriptionPlan(user), "premium");
});

test("assistant prompt includes profile memory and free response limit", () => {
  const prompt = buildNutritionAssistantPrompt({
    user: {
      telegramId: 1,
      goal: { type: "lose", dailyCalories: 1800 },
      currentWeightKg: 80,
      activityLevel: "medium",
      onboardingComplete: true,
      subscriptionPlan: "free",
      premium: false,
      weeklyReportsEnabled: true,
      dailyRemindersEnabled: true,
      scansToday: 0,
      aiMessagesToday: 0,
      createdAt: new Date().toISOString(),
    },
  });
  assert.match(prompt, /lose, 1800 kcal\/day/);
  assert.match(prompt, /activity medium/);
  assert.match(prompt, /300-500 characters/);
});
