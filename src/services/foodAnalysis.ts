import OpenAI from "openai";
import { z } from "zod";
import type { FoodAnalysisResult, GoalType, PremiumPlan } from "../types/index.js";
import { config } from "../config.js";
import { blendWithReference, findBestNutritionMatch } from "./usda.js";
import { FoodAnalysisError } from "./foodAnalysisErrors.js";
import {
  resolveOpenAiImageMime,
  toDataImageUrl,
  type OpenAiImageMime,
} from "./imageMime.js";
import { mergeMicronutrients, mockMicronutrients, premiumAnalysisPromptAddon } from "./micronutrients.js";

const macrosSchema = z.object({
  proteinG: z.coerce.number(),
  fatG: z.coerce.number(),
  carbsG: z.coerce.number(),
});

const analysisSchema = z.object({
  dishName: z.string().min(1),
  searchQueryEn: z.string().optional(),
  calories: z.coerce.number().positive(),
  macros: macrosSchema,
  estimatedGrams: z.coerce.number().positive().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  caloriesPer100g: z.coerce.number().positive().optional(),
  proteinPer100g: z.coerce.number().nonnegative().optional(),
  fatPer100g: z.coerce.number().nonnegative().optional(),
  carbsPer100g: z.coerce.number().nonnegative().optional(),
  advice: z.string().min(1),
  micronutrients: z
    .object({
      fiberG: z.coerce.number().optional(),
      sugarG: z.coerce.number().optional(),
      sodiumMg: z.coerce.number().optional(),
      potassiumMg: z.coerce.number().optional(),
      vitaminCMg: z.coerce.number().optional(),
      ironMg: z.coerce.number().optional(),
      calciumMg: z.coerce.number().optional(),
    })
    .optional(),
});

export type PhotoSource =
  | { telegramFilePath: string }
  | { imageUrl: string };

export interface AnalyzeOptions {
  premium?: boolean;
  premiumPlan?: PremiumPlan;
  aiRecommendations?: boolean;
  personalNutritionist?: boolean;
  mealPlans?: boolean;
  goalType?: GoalType;
  dailyCalories?: number;
}

function goalHint(goalType?: GoalType, dailyCalories?: number): string {
  if (!goalType) return "";
  const labels: Record<GoalType, string> = {
    lose: "похудение",
    gain: "набор массы",
    maintain: "поддержание веса",
  };
  const kcal = dailyCalories ? `, цель ~${dailyCalories} ккал/день` : "";
  return ` Цель пользователя: ${labels[goalType]}${kcal}. Учти это в совете.`;
}

function buildSystemPrompt(options: AnalyzeOptions): string {
  const premium = options.premium ?? false;
  let prompt = `Ты профессиональный нутрициолог. Анализируй еду на русском языке.

Для фото: определи блюдо(а), оцени размер порции по тарелке/приборам/упаковке, посчитай калории и БЖУ именно для видимой порции (не на 100 г, если не указано иначе).
Для текста: оцени типичную порцию, если объём не указан.

Уровень пользователя: ${options.premiumPlan ?? "free"}.
${options.aiRecommendations ? "Дай более прикладную рекомендацию нутрициолога: как встроить этот приём пищи в дневной рацион." : ""}
${options.personalNutritionist ? "Действуй как персональный AI-нутрициолог: учитывай цель, баланс дня и предложи конкретный следующий шаг." : ""}
${options.mealPlans ? "Если уместно, добавь короткую идею следующего приёма пищи или коррекцию плана на день." : ""}

Оцени порцию как medium (~250g), но верни значения на 100 г и estimatedGrams.
Ответь строго одним JSON-объектом без markdown:
{
  "dishName": "название на русском",
  "searchQueryEn": "english dish name for nutrition database",
  "estimatedGrams": number,
  "confidence": number,
  "caloriesPer100g": number,
  "proteinPer100g": number,
  "fatPer100g": number,
  "carbsPer100g": number,
  "calories": number,
  "macros": {"proteinG": number, "fatG": number, "carbsG": number},
  "advice": "короткий персональный совет 1-2 предложения"
}`;
  if (premium) {
    prompt += `,
  "micronutrients": {"fiberG":number,"sugarG":number,"sodiumMg":number,"potassiumMg":number,"vitaminCMg":number,"ironMg":number,"calciumMg":number}`;
    prompt += premiumAnalysisPromptAddon();
  }
  prompt += "\n}";
  if (options.goalType) prompt += goalHint(options.goalType, options.dailyCalories);
  return prompt;
}

function mockAnalysis(hint?: string, premium = false): FoodAnalysisResult {
  const name = hint?.trim() || "Блюдо";
  const result: FoodAnalysisResult = {
    dishName: name.charAt(0).toUpperCase() + name.slice(1),
    searchQueryEn: name,
    calories: 350,
    macros: { proteinG: 12, fatG: 10, carbsG: 45 },
    estimatedGrams: 250,
    confidence: 0.6,
    caloriesPer100g: 140,
    proteinPer100g: 4.8,
    fatPer100g: 4,
    carbsPer100g: 18,
    advice:
      "⚠️ Демо-режим: задайте OPENAI_API_KEY в .env для реального AI-анализа. " +
      "Совет: сбалансируйте белок в следующих приёмах пищи.",
    caloriesSource: "ai",
  };
  if (premium) result.micronutrients = mockMicronutrients();
  return result;
}

function requireOpenAi(): void {
  if (!config.OPENAI_API_KEY) {
    throw new FoodAnalysisError(
      "OPENAI_API_KEY не задан. Добавьте ключ в .env: https://platform.openai.com/api-keys",
      "NO_API_KEY",
    );
  }
}

function mayUseMock(): boolean {
  return config.OPENAI_ALLOW_MOCK && !config.OPENAI_API_KEY;
}

function parseAiJson(content: string): FoodAnalysisResult {
  try {
    const raw = JSON.parse(content) as unknown;
    const parsed = analysisSchema.parse(raw);
    return {
      dishName: parsed.dishName.trim(),
      searchQueryEn: parsed.searchQueryEn?.trim(),
      calories: Math.round(parsed.calories),
      macros: {
        proteinG: round1(parsed.macros.proteinG),
        fatG: round1(parsed.macros.fatG),
        carbsG: round1(parsed.macros.carbsG),
      },
      advice: parsed.advice.trim(),
      micronutrients: parsed.micronutrients,
      caloriesSource: "ai",
      estimatedGrams: parsed.estimatedGrams,
      confidence: parsed.confidence,
      caloriesPer100g: parsed.caloriesPer100g,
      proteinPer100g: parsed.proteinPer100g,
      fatPer100g: parsed.fatPer100g,
      carbsPer100g: parsed.carbsPer100g,
    };
  } catch (err) {
    throw new FoodAnalysisError("Не удалось разобрать ответ AI", "PARSE_ERROR", err);
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function downloadTelegramPhoto(
  filePath: string,
): Promise<{ base64: string; mimeType: OpenAiImageMime }> {
  const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${filePath}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new FoodAnalysisError("Не удалось скачать фото из Telegram", "DOWNLOAD_ERROR", err);
  }
  if (!res.ok) {
    throw new FoodAnalysisError(`Telegram file error: ${res.status}`, "DOWNLOAD_ERROR");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new FoodAnalysisError("Пустой файл фото", "DOWNLOAD_ERROR");
  }
  if (buffer.length > config.OPENAI_MAX_IMAGE_MB * 1024 * 1024) {
    throw new FoodAnalysisError(
      `Фото слишком большое. Максимум: ${config.OPENAI_MAX_IMAGE_MB} MB`,
      "DOWNLOAD_ERROR",
    );
  }

  const mimeType = resolveOpenAiImageMime(
    buffer,
    res.headers.get("content-type"),
    filePath,
  );

  return { base64: buffer.toString("base64"), mimeType };
}

function buildImageContent(
  downloaded: { base64: string; mimeType: OpenAiImageMime },
): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: "image_url",
    image_url: {
      url: toDataImageUrl(downloaded.base64, downloaded.mimeType),
      detail: "high",
    },
  };
}

async function callOpenAiVision(
  image: OpenAI.Chat.Completions.ChatCompletionContentPartImage,
  userText: string,
  options: AnalyzeOptions,
): Promise<FoodAnalysisResult> {
  requireOpenAi();

  const premium = options.premium ?? false;
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  try {
    const response = await retryOpenAi(() => openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(options),
        },
        {
          role: "user",
          content: [{ type: "text", text: userText }, image],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.3,
    }));

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new FoodAnalysisError("Пустой ответ OpenAI", "API_ERROR");
    }
    return parseAiJson(content);
  } catch (err) {
    if (err instanceof FoodAnalysisError) throw err;
    const message = sanitizeErrorMessage(err instanceof Error ? err.message : "OpenAI request failed");
    throw new FoodAnalysisError(message, "API_ERROR", err);
  }
}

async function callOpenAiText(query: string, options: AnalyzeOptions): Promise<FoodAnalysisResult> {
  if (mayUseMock()) return mockAnalysis(query, options.premium ?? false);
  requireOpenAi();

  const premium = options.premium ?? false;
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

  try {
    const response = await retryOpenAi(() => openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(options),
        },
        { role: "user", content: `Оцени калорийность блюда: ${query}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.3,
    }));

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new FoodAnalysisError("Пустой ответ OpenAI", "API_ERROR");
    }
    return parseAiJson(content);
  } catch (err) {
    if (err instanceof FoodAnalysisError) throw err;
    const message = sanitizeErrorMessage(err instanceof Error ? err.message : "OpenAI request failed");
    throw new FoodAnalysisError(message, "API_ERROR", err);
  }
}

async function refineWithNutritionDb(result: FoodAnalysisResult): Promise<FoodAnalysisResult> {
  const match = await findBestNutritionMatch(result.dishName, result.searchQueryEn);
  if (!match || match.confidence < 0.55) return result;
  return blendWithReference(result, match);
}

export async function analyzeFoodFromText(
  query: string,
  options: AnalyzeOptions = {},
): Promise<FoodAnalysisResult> {
  const ai = await callOpenAiText(query, options);
  const refined = await refineWithNutritionDb(ai);
  return mergeMicronutrients(refined, options.premium ?? false);
}

export async function analyzeFoodFromPhoto(
  source: PhotoSource,
  caption?: string,
  options: AnalyzeOptions = {},
): Promise<FoodAnalysisResult> {
  if (mayUseMock()) {
    return mergeMicronutrients(
      mockAnalysis(caption ?? "Завтрак", options.premium ?? false),
      options.premium ?? false,
    );
  }

  let downloaded: { base64: string; mimeType: OpenAiImageMime };
  if ("telegramFilePath" in source) {
    downloaded = await downloadTelegramPhoto(source.telegramFilePath);
  } else {
    const res = await fetch(source.imageUrl);
    if (!res.ok) {
      throw new FoodAnalysisError(`Не удалось загрузить изображение: ${res.status}`, "DOWNLOAD_ERROR");
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > config.OPENAI_MAX_IMAGE_MB * 1024 * 1024) {
      throw new FoodAnalysisError(
        `Изображение слишком большое. Максимум: ${config.OPENAI_MAX_IMAGE_MB} MB`,
        "DOWNLOAD_ERROR",
      );
    }
    downloaded = {
      base64: buffer.toString("base64"),
      mimeType: resolveOpenAiImageMime(buffer, res.headers.get("content-type")),
    };
  }

  const userText = caption
    ? `Подпись к фото: ${caption}. Определи блюдо и калорийность порции на фото.`
    : "Определи блюдо на фото и оцени калории и БЖУ для видимой порции.";

  const image = buildImageContent(downloaded);
  const ai = await callOpenAiVision(image, userText, options);
  const refined = await refineWithNutritionDb(ai);
  return mergeMicronutrients(refined, options.premium ?? false);
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

async function retryOpenAi<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
