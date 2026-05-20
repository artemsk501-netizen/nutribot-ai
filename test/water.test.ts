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

test("water logs and day stats", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({ telegramId: 42, onboardingComplete: true });
    await store.setWaterSettings(42, { goalMl: 2000, remindersEnabled: true });
    await store.addWaterLog({
      id: randomUUID(),
      userId: 42,
      amountMl: 250,
      createdAt: "2026-05-20T10:00:00.000Z",
    });
    const stats = await store.getWaterDayStats(42, "2026-05-20");
    assert.equal(stats.totalMl, 250);
    assert.equal(stats.goalMl, 2000);
    assert.equal(stats.logCount, 1);
  } finally {
    db.close();
  }
});

test("meals with extended metadata persist", async () => {
  const { db, store } = makeStore();
  try {
    await store.upsertUser({ telegramId: 7 });
    await store.addMeal({
      id: randomUUID(),
      userId: 7,
      dishName: "Rice",
      calories: 280,
      macros: { proteinG: 5, fatG: 2, carbsG: 55 },
      grams: 200,
      portionSize: "medium",
      confidence: 0.82,
      caloriesPer100g: 140,
      proteinPer100g: 2.5,
      fatPer100g: 1,
      carbsPer100g: 27.5,
      source: "ai",
      createdAt: "2026-05-20T12:00:00.000Z",
    });
    const meals = await store.getMealsForDate(7, "2026-05-20");
    assert.equal(meals.length, 1);
    assert.equal(meals[0]?.grams, 200);
    assert.equal(meals[0]?.confidence, 0.82);
  } finally {
    db.close();
  }
});
