import type { FoodAnalysisResult, Macros, MealEntry, PortionSize } from "../types/index.js";

export const PORTION_MULTIPLIERS: Record<Exclude<PortionSize, "custom">, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.4,
};

export function derivePer100gFromResult(result: FoodAnalysisResult): {
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  estimatedGrams: number;
} {
  if (
    result.caloriesPer100g != null &&
    result.proteinPer100g != null &&
    result.fatPer100g != null &&
    result.carbsPer100g != null
  ) {
    const grams = result.estimatedGrams ?? 250;
    return {
      caloriesPer100g: result.caloriesPer100g,
      proteinPer100g: result.proteinPer100g,
      fatPer100g: result.fatPer100g,
      carbsPer100g: result.carbsPer100g,
      estimatedGrams: grams,
    };
  }

  const grams = result.estimatedGrams ?? 250;
  const factor = 100 / grams;
  return {
    caloriesPer100g: Math.round(result.calories * factor),
    proteinPer100g: round1(result.macros.proteinG * factor),
    fatPer100g: round1(result.macros.fatG * factor),
    carbsPer100g: round1(result.macros.carbsG * factor),
    estimatedGrams: grams,
  };
}

export function macrosFromPer100g(
  per100: { proteinPer100g: number; fatPer100g: number; carbsPer100g: number },
  grams: number,
): Macros {
  const factor = grams / 100;
  return {
    proteinG: round1(per100.proteinPer100g * factor),
    fatG: round1(per100.fatPer100g * factor),
    carbsG: round1(per100.carbsPer100g * factor),
  };
}

export function applyPortionToMeal(
  meal: MealEntry,
  portion: PortionSize,
  customGrams?: number,
): MealEntry {
  const per100 = {
    caloriesPer100g: meal.caloriesPer100g ?? 0,
    proteinPer100g: meal.proteinPer100g ?? 0,
    fatPer100g: meal.fatPer100g ?? 0,
    carbsPer100g: meal.carbsPer100g ?? 0,
  };

  let grams = meal.grams ?? 250;
  if (portion === "custom" && customGrams != null) {
    grams = customGrams;
  } else if (portion !== "custom") {
    const base = meal.grams ?? 250;
    grams = Math.round(base * PORTION_MULTIPLIERS[portion]);
  }

  const macros = macrosFromPer100g(per100, grams);
  const calories = Math.round((meal.caloriesPer100g ?? 0) * (grams / 100));

  return {
    ...meal,
    grams,
    portionSize: portion,
    calories,
    macros,
    source: meal.source ?? "ai",
  };
}

export function buildMealFromAnalysis(
  result: FoodAnalysisResult,
  userId: number,
  id: string,
  photoFileId?: string,
): MealEntry {
  const per = derivePer100gFromResult(result);
  const grams = per.estimatedGrams;
  const macros = macrosFromPer100g(per, grams);
  const calories = Math.round(per.caloriesPer100g * (grams / 100));

  return {
    id,
    userId,
    dishName: result.dishName,
    calories,
    macros,
    advice: result.advice,
    photoFileId,
    usdaFdcId: result.usdaFdcId,
    caloriesSource: result.caloriesSource ?? "ai",
    micronutrients: result.micronutrients,
    grams,
    portionSize: "medium",
    confidence: result.confidence,
    caloriesPer100g: per.caloriesPer100g,
    proteinPer100g: per.proteinPer100g,
    fatPer100g: per.fatPer100g,
    carbsPer100g: per.carbsPer100g,
    source: "ai",
    createdAt: new Date().toISOString(),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
