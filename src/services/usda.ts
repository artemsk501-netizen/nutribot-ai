import { config } from "../config.js";
import type { FoodAnalysisResult, Macros } from "../types/index.js";

export interface UsdaMatch {
  fdcId?: number;
  name: string;
  calories: number;
  macros: Macros;
  source: "local" | "usda";
  confidence: number;
}

interface LocalFood {
  name: string;
  aliases: string[];
  calories: number;
  macros: Macros;
  servingG: number;
}

const localFoods: LocalFood[] = [
  {
    name: "Борщ",
    aliases: ["борщ", "borscht"],
    calories: 57,
    macros: { proteinG: 3.8, fatG: 2.9, carbsG: 4.3 },
    servingG: 100,
  },
  {
    name: "Овсяная каша",
    aliases: ["овсянка", "каша овсяная", "oatmeal", "porridge"],
    calories: 370,
    macros: { proteinG: 13.2, fatG: 6.5, carbsG: 67.7 },
    servingG: 100,
  },
  {
    name: "Куриная грудка",
    aliases: ["курица", "куриное филе", "chicken breast", "chicken"],
    calories: 165,
    macros: { proteinG: 31, fatG: 3.6, carbsG: 0 },
    servingG: 100,
  },
  {
    name: "Гречка вареная",
    aliases: ["гречка", "гречневая каша", "buckwheat"],
    calories: 110,
    macros: { proteinG: 3.6, fatG: 1.1, carbsG: 21.3 },
    servingG: 100,
  },
  {
    name: "Банан",
    aliases: ["банан", "banana"],
    calories: 89,
    macros: { proteinG: 1.1, fatG: 0.3, carbsG: 22.8 },
    servingG: 100,
  },
];

export function searchLocalFood(query: string): UsdaMatch | null {
  const q = normalize(query);
  if (!q) return null;

  let best: { food: LocalFood; score: number } | null = null;

  for (const food of localFoods) {
    const names = [food.name, ...food.aliases];
    for (const name of names) {
      const n = normalize(name);
      const score = similarity(q, n);
      if (score >= 0.55 && (!best || score > best.score)) {
        best = { food, score };
      }
    }
  }

  if (!best) return null;

  return {
    name: best.food.name,
    calories: best.food.calories,
    macros: best.food.macros,
    source: "local",
    confidence: best.score,
  };
}

export async function searchUsdaApi(query: string): Promise<UsdaMatch | null> {
  if (!config.USDA_API_KEY) return null;

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", config.USDA_API_KEY);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("dataType", "Survey (FNDDS),SR Legacy,Foundation");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    foods?: Array<{
      fdcId: number;
      description: string;
      foodNutrients?: Array<{ nutrientName: string; value: number }>;
    }>;
  };

  const food = data.foods?.[0];
  if (!food) return null;

  const nutrients = food.foodNutrients ?? [];
  const get = (name: string) =>
    nutrients.find((n) => n.nutrientName.toLowerCase().includes(name.toLowerCase()))?.value ?? 0;

  const calories = get("energy") || get("calories");
  if (!calories) return null;

  return {
    fdcId: food.fdcId,
    name: food.description,
    calories: Math.round(calories),
    macros: {
      proteinG: round1(get("protein")),
      fatG: round1(get("fat") || get("total lipid")),
      carbsG: round1(get("carbohydrate")),
    },
    source: "usda",
    confidence: 0.75,
  };
}

export async function findBestNutritionMatch(
  dishName: string,
  searchQueryEn?: string,
): Promise<UsdaMatch | null> {
  const local = searchLocalFood(dishName);
  if (local && local.confidence >= 0.7) return local;

  const enQuery = searchQueryEn?.trim() || dishName;
  const usda = await searchUsdaApi(enQuery);
  if (usda) return usda;

  return local;
}

export function blendWithReference(
  ai: FoodAnalysisResult,
  ref: UsdaMatch,
): FoodAnalysisResult {
  const wRef = ref.confidence >= 0.8 ? 0.7 : 0.5;
  const wAi = 1 - wRef;

  const calories = Math.round(ai.calories * wAi + ref.calories * wRef);
  const macros: Macros = {
    proteinG: round1(ai.macros.proteinG * wAi + ref.macros.proteinG * wRef),
    fatG: round1(ai.macros.fatG * wAi + ref.macros.fatG * wRef),
    carbsG: round1(ai.macros.carbsG * wAi + ref.macros.carbsG * wRef),
  };

  const sourceLabel = ref.source === "usda" ? "USDA" : "база продуктов";
  const verified =
    ref.confidence >= 0.7
      ? ` (уточнено по ${sourceLabel})`
      : "";

  return {
    dishName: ai.dishName,
    calories,
    macros,
    advice: ai.advice + verified,
    searchQueryEn: ai.searchQueryEn,
    usdaFdcId: ref.fdcId,
    caloriesSource: ref.source === "usda" ? "usda" : "blend",
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, "").trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aWords = new Set(a.split(/\s+/));
  const bWords = b.split(/\s+/);
  let hits = 0;
  for (const w of bWords) {
    if (aWords.has(w)) hits++;
  }
  return hits / Math.max(bWords.length, 1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
