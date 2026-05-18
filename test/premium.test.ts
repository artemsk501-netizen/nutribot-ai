import test from "node:test";
import assert from "node:assert/strict";
import {
  getPremiumPlan,
  hasPremiumFeature,
  premiumPayload,
  premiumPlanFromPayload,
} from "../src/services/premium.js";
import type { UserProfile } from "../src/types/index.js";

function user(plan: UserProfile["premiumPlan"], expiresAt?: string): UserProfile {
  return {
    telegramId: 1,
    onboardingComplete: true,
    subscriptionPlan: "premium",
    premium: true,
    premiumPlan: plan,
    premiumExpiresAt: expiresAt ?? new Date(Date.now() + 86_400_000).toISOString(),
    weeklyReportsEnabled: true,
    dailyRemindersEnabled: true,
    scansToday: 0,
    aiMessagesToday: 0,
    createdAt: new Date().toISOString(),
  };
}

test("premium payload roundtrip", () => {
  assert.equal(premiumPlanFromPayload(premiumPayload("basic")), "basic");
  assert.equal(premiumPlanFromPayload(premiumPayload("pro")), "pro");
  assert.equal(premiumPlanFromPayload(premiumPayload("ultra")), "ultra");
  assert.equal(premiumPlanFromPayload("premium:bad:monthly"), undefined);
  assert.equal(premiumPlanFromPayload("premium:unknown:monthly"), undefined);
});

test("premium feature gates by plan", () => {
  assert.equal(getPremiumPlan(user("basic")), "basic");
  assert.equal(hasPremiumFeature(user("basic"), "micronutrients"), false);
  assert.equal(hasPremiumFeature(user("pro"), "micronutrients"), true);
  assert.equal(hasPremiumFeature(user("pro"), "exportPdf"), false);
  assert.equal(hasPremiumFeature(user("ultra"), "exportPdf"), true);
});

test("expired premium disables feature access", () => {
  const expired = user("ultra", new Date(Date.now() - 86_400_000).toISOString());
  assert.equal(getPremiumPlan(expired), undefined);
  assert.equal(hasPremiumFeature(expired, "advancedAnalytics"), false);
});
