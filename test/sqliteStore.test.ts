import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { SqliteStore } from "../src/services/store.sqlite.js";

function makeStore(): { db: DatabaseSync; store: SqliteStore } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.resolve("src/db/sqlite/schema.sql"), "utf-8"));
  return { db, store: new SqliteStore(db) };
}

test("persists user, goals, meals, day/week/month stats and weight", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({ telegramId: 10, firstName: "Amina" });
    assert.equal((await store.getUsageStatus(10, "photo_scan", "2026-05-18")).remaining, 3);
    await store.incrementUsage(10, "photo_scan", "2026-05-18");
    await store.incrementUsage(10, "ai_message", "2026-05-18");
    await store.upsertUser({
      telegramId: 10,
      currentWeightKg: 72.5,
      targetWeightKg: 65,
      heightCm: 170,
      age: 30,
      activityLevel: "medium",
      proteinGoalG: 130,
      fatGoalG: 60,
      carbsGoalG: 200,
      onboardingStep: "complete",
      onboardingComplete: true,
    });
    await store.setGoal(10, { type: "lose", dailyCalories: 1800, targetWeightKg: 65 });
    await store.addMeal({
      id: randomUUID(),
      userId: 10,
      dishName: "Овсянка",
      calories: 350,
      macros: { proteinG: 12, fatG: 8, carbsG: 55 },
      createdAt: "2026-05-18T08:00:00.000Z",
    });
    await store.addWeightEntry({
      id: randomUUID(),
      userId: 10,
      weightKg: 72.5,
      createdAt: "2026-05-18T09:00:00.000Z",
    });

    const day = await store.getDayStats(10, "2026-05-18");
    assert.equal(day.totalCalories, 350);
    assert.equal(day.totalMacros.proteinG, 12);
    assert.equal(day.meals.length, 1);

    const week = await store.getWeekStats(10, "2026-05-18");
    assert.equal(week.totalCalories, 350);

    const month = await store.getMonthStats(10, "2026-05-18");
    assert.equal(month.totalCalories, 350);

    const weight = await store.getWeightHistory(10, 30);
    assert.equal(weight.latest?.weightKg, 72.5);

    const profile = await store.getUser(10);
    assert.equal(profile?.currentWeightKg, 72.5);
    assert.equal(profile?.targetWeightKg, 65);
    assert.equal(profile?.heightCm, 170);
    assert.equal(profile?.age, 30);
    assert.equal(profile?.activityLevel, "medium");
    assert.equal(profile?.proteinGoalG, 130);
    assert.equal(profile?.onboardingComplete, true);
    assert.equal(profile?.scansToday, 1);
    assert.equal(profile?.aiMessagesToday, 1);
  } finally {
    db.close();
  }
});

test("records payments, admin metrics and referrals with anti-abuse", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({ telegramId: 1 });
    await store.upsertUser({ telegramId: 2 });
    assert.equal(await store.registerReferral(1, 2), true);
    assert.equal(await store.registerReferral(1, 2), false);
    assert.equal(await store.registerReferral(2, 2), false);

    await store.upsertUser({
      telegramId: 1,
      subscriptionPlan: "premium",
      premium: true,
      premiumPlan: "pro",
      premiumExpiresAt: "2999-01-01T00:00:00.000Z",
    });
    await store.recordPayment({
      id: randomUUID(),
      userId: 1,
      payload: "premium:pro:monthly",
      plan: "pro",
      stars: 300,
      currency: "XTR",
      createdAt: "2026-05-18T10:00:00.000Z",
    });

    const referrals = await store.getReferralStats(1, "nutribot_ai");
    assert.equal(referrals.referralsCount, 1);

    const metrics = await store.getAdminMetrics();
    assert.equal(metrics.totalUsers, 2);
    assert.equal(metrics.freeUsers, 1);
    assert.equal(metrics.premiumUsers, 1);
    assert.equal(metrics.totalStars, 300);
    assert.equal(metrics.referralsCount, 1);
  } finally {
    db.close();
  }
});

test("enforces free daily usage limits and resets on date change", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({ telegramId: 20 });

    for (let i = 0; i < 3; i += 1) {
      const before = await store.getUsageStatus(20, "photo_scan", "2026-05-18");
      assert.equal(before.allowed, true);
      await store.incrementUsage(20, "photo_scan", "2026-05-18");
    }

    const blocked = await store.getUsageStatus(20, "photo_scan", "2026-05-18");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);

    const reset = await store.getUsageStatus(20, "photo_scan", "2026-05-19");
    assert.equal(reset.allowed, true);
    assert.equal(reset.used, 0);
    assert.equal(reset.remaining, 3);
  } finally {
    db.close();
  }
});

test("premium users have unlimited usage and keep plan during profile upserts", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({
      telegramId: 30,
      subscriptionPlan: "premium",
      premium: true,
      premiumPlan: "ultra",
      premiumExpiresAt: "2999-01-01T00:00:00.000Z",
    });

    for (let i = 0; i < 8; i += 1) {
      await store.incrementUsage(30, "ai_message", "2026-05-18");
    }

    await store.upsertUser({ telegramId: 30, firstName: "Premium" });
    const usage = await store.getUsageStatus(30, "ai_message", "2026-05-18");
    const user = await store.getUser(30);
    assert.equal(usage.allowed, true);
    assert.equal(usage.limit, null);
    assert.equal(user?.premiumPlan, "ultra");
  } finally {
    db.close();
  }
});

test("persists meals and stats after sqlite database reopen", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nutribot-test-"));
  const dbPath = path.join(dir, "nutribot.db");
  const schema = fs.readFileSync(path.resolve("src/db/sqlite/schema.sql"), "utf-8");

  const db1 = new DatabaseSync(dbPath);
  db1.exec("PRAGMA foreign_keys = ON");
  db1.exec(schema);
  const store1 = new SqliteStore(db1);
  await store1.upsertUser({ telegramId: 40 });
  await store1.addMeal({
    id: randomUUID(),
    userId: 40,
    dishName: "Гречка с курицей",
    calories: 520,
    macros: { proteinG: 38, fatG: 14, carbsG: 58 },
    createdAt: "2026-05-18T12:00:00.000Z",
  });
  db1.close();

  const db2 = new DatabaseSync(dbPath);
  db2.exec("PRAGMA foreign_keys = ON");
  const store2 = new SqliteStore(db2);
  try {
    const day = await store2.getDayStats(40, "2026-05-18");
    const week = await store2.getWeekStats(40, "2026-05-18");
    const month = await store2.getMonthStats(40, "2026-05-18");
    assert.equal(day.totalCalories, 520);
    assert.equal(day.totalMacros.proteinG, 38);
    assert.equal(week.totalCalories, 520);
    assert.equal(month.totalCalories, 520);
  } finally {
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
