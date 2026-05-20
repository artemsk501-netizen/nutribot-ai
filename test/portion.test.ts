import test from "node:test";
import assert from "node:assert/strict";
import { applyPortionToMeal, derivePer100gFromResult, macrosFromPer100g } from "../src/services/portion.js";
import type { MealEntry } from "../src/types/index.js";

const baseMeal: MealEntry = {
  id: "1",
  userId: 1,
  dishName: "Salad",
  calories: 350,
  macros: { proteinG: 12, fatG: 10, carbsG: 45 },
  grams: 250,
  caloriesPer100g: 140,
  proteinPer100g: 4.8,
  fatPer100g: 4,
  carbsPer100g: 18,
  createdAt: "2026-05-20T12:00:00.000Z",
};

test("portion multipliers adjust grams and calories", () => {
  const small = applyPortionToMeal(baseMeal, "small");
  assert.equal(small.grams, 175);
  assert.equal(small.calories, Math.round(140 * 1.75));

  const large = applyPortionToMeal(baseMeal, "large");
  assert.equal(large.grams, 350);
});

test("custom grams recalculates macros from per100g", () => {
  const custom = applyPortionToMeal(baseMeal, "custom", 100);
  assert.equal(custom.grams, 100);
  assert.equal(custom.calories, 140);
  assert.equal(custom.macros.proteinG, 4.8);
});

test("derivePer100gFromResult uses AI fields when present", () => {
  const per = derivePer100gFromResult({
    dishName: "Soup",
    calories: 200,
    macros: { proteinG: 8, fatG: 6, carbsG: 20 },
    advice: "ok",
    estimatedGrams: 300,
    caloriesPer100g: 67,
    proteinPer100g: 2.7,
    fatPer100g: 2,
    carbsPer100g: 6.7,
  });
  assert.equal(per.estimatedGrams, 300);
  assert.equal(per.caloriesPer100g, 67);
  const macros = macrosFromPer100g(per, 300);
  assert.equal(macros.proteinG, 8.1);
});
