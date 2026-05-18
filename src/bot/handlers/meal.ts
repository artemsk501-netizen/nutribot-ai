import { randomUUID } from "node:crypto";
import type { Bot, Context } from "grammy";
import { analyzeFoodFromPhoto, analyzeFoodFromText } from "../../services/foodAnalysis.js";
import { FoodAnalysisError } from "../../services/foodAnalysisErrors.js";
import { getPremiumPlan, hasPremiumFeature } from "../../services/premium.js";
import { getStore } from "../../services/store.js";
import { ensureUser } from "../helpers/user.js";
import type { MealEntry } from "../../types/index.js";
import { afterMealKeyboard, mealConfirmationKeyboard, upgradeKeyboard } from "../keyboards.js";
import { ANALYZING_TEXT, formatMealCard, formatPendingMealSummary } from "../messages.js";
import { formatUsageCounter, LIMIT_REACHED_MESSAGE } from "../../services/usageLimits.js";
import { nowInBotDayISO, todayISO } from "../../utils/date.js";

type EditStep = "calories" | "protein" | "fat" | "carbs";

interface PendingMeal {
  meal: MealEntry;
  showMicronutrients: boolean;
  expiresAt: number;
  editStep?: EditStep;
}

const PENDING_TTL_MS = 30 * 60 * 1000;
const pendingMeals = new Map<number, PendingMeal>();

export async function processFoodAnalysis(
  ctx: Context,
  analyze: () => Promise<import("../../types/index.js").FoodAnalysisResult>,
  photoFileId?: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = (await ensureUser(ctx)) ?? (await getStore().getUser(userId));
  const showMicronutrients = hasPremiumFeature(user, "micronutrients");
  const store = getStore();

  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply(ANALYZING_TEXT);

  let result: import("../../types/index.js").FoodAnalysisResult;
  try {
    result = await analyze();
  } catch (err) {
    const text = formatAnalysisError(err);
    await ctx.api
      .editMessageText(ctx.chat!.id, statusMsg.message_id, text, { parse_mode: "Markdown" })
      .catch(() => ctx.reply(text, { parse_mode: "Markdown" }));
    return;
  }

  const meal: MealEntry = {
    id: randomUUID(),
    userId,
    dishName: result.dishName,
    calories: result.calories,
    macros: result.macros,
    advice: result.advice,
    photoFileId,
    usdaFdcId: result.usdaFdcId,
    caloriesSource: result.caloriesSource ?? "ai",
    micronutrients: showMicronutrients ? result.micronutrients : undefined,
    createdAt: nowInBotDayISO(),
  };

  const usage = photoFileId
    ? await store.incrementUsage(userId, "photo_scan", meal.createdAt.slice(0, 10))
    : undefined;
  await store.upsertUser({
    telegramId: userId,
    firstName: ctx.from?.first_name,
    languageCode: ctx.from?.language_code,
  });

  if (photoFileId) {
    pendingMeals.set(userId, {
      meal,
      showMicronutrients,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
  }

  const card = usage
    ? `${formatPendingMealSummary(meal, showMicronutrients)}\n\n${formatUsageCounter(usage)}`
    : formatMealCard(result, showMicronutrients);
  const markup = {
    parse_mode: "Markdown" as const,
    reply_markup: photoFileId ? mealConfirmationKeyboard() : afterMealKeyboard(),
  };

  if (photoFileId) {
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => undefined);
    await ctx.replyWithPhoto(photoFileId, { caption: card, ...markup });
  } else {
    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, card, markup);
  }

  if (!photoFileId) {
    await store.addMeal(meal);
    await notifyCalorieGoalIfNeeded(ctx, userId, meal.createdAt.slice(0, 10));
  }
}

async function notifyCalorieGoalIfNeeded(ctx: Context, userId: number, date: string): Promise<void> {
  const store = getStore();
  const user = await store.getUser(userId);
  const target = user?.goal?.dailyCalories;
  if (!target) return;

  const stats = await store.getDayStats(userId, date);
  if (stats.totalCalories <= target) return;

  await ctx.reply(
    `⚠️ **Цель калорий превышена**\n\nСегодня: **${stats.totalCalories} / ${target}** ккал.\n` +
      `Перебор: **${stats.totalCalories - target}** ккал.`,
    { parse_mode: "Markdown" },
  );
}

function analyzeOptionsFromUser(
  user: Awaited<ReturnType<ReturnType<typeof getStore>["getUser"]>>,
) {
  return {
    premium: hasPremiumFeature(user, "micronutrients"),
    premiumPlan: getPremiumPlan(user),
    aiRecommendations: hasPremiumFeature(user, "aiRecommendations"),
    personalNutritionist: hasPremiumFeature(user, "personalNutritionist"),
    mealPlans: hasPremiumFeature(user, "mealPlans"),
    goalType: user?.goal?.type,
    dailyCalories: user?.goal?.dailyCalories,
  };
}

function formatAnalysisError(err: unknown): string {
  if (err instanceof FoodAnalysisError) {
    if (err.code === "NO_API_KEY") {
      return (
        "⚠️ **AI-анализ недоступен**\n\n" +
        "Добавьте `OPENAI_API_KEY` в файл `.env` на сервере бота и перезапустите.\n\n" +
        "Ключ: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)"
      );
    }
    return `⚠️ Не удалось проанализировать еду: ${err.message}`;
  }
  console.error("Food analysis error:", err);
  return "⚠️ Ошибка при анализе. Попробуйте ещё раз или отправьте другое фото.";
}

export async function handlePhoto(ctx: Context): Promise<void> {
  const photo = ctx.message?.photo;
  if (!photo?.length) return;

  const fileId = photo[photo.length - 1]!.file_id;
  const caption = ctx.message?.caption;
  const store = getStore();
  const userId = ctx.from?.id;
  const user = userId ? await store.getUser(userId) : undefined;
  if (!userId) return;
  const usage = await store.getUsageStatus(userId, "photo_scan", todayISO());
  if (!usage.allowed) {
    await ctx.reply(LIMIT_REACHED_MESSAGE, { parse_mode: "Markdown", reply_markup: upgradeKeyboard() });
    return;
  }
  const analyzeOpts = analyzeOptionsFromUser(user);

  await processFoodAnalysis(
    ctx,
    async () => {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) {
        throw new FoodAnalysisError("Файл фото недоступен", "DOWNLOAD_ERROR");
      }
      return analyzeFoodFromPhoto({ telegramFilePath: file.file_path }, caption, analyzeOpts);
    },
    fileId,
  );
}

export async function handleTextMeal(ctx: Context, text: string): Promise<void> {
  const userId = ctx.from?.id;
  const user = userId ? await getStore().getUser(userId) : undefined;
  await processFoodAnalysis(ctx, () =>
    analyzeFoodFromText(text, analyzeOptionsFromUser(user)),
  );
}

export function registerMealConfirmation(bot: Bot): void {
  bot.callbackQuery("meal:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    await confirmPendingMeal(ctx);
  });

  bot.callbackQuery("meal:edit", async (ctx) => {
    const pending = getFreshPending(ctx.from.id);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Черновик анализа устарел." });
      await ctx.reply("⏳ Черновик анализа устарел. Отправьте фото ещё раз.");
      return;
    }

    pending.editStep = "calories";
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await ctx.answerCallbackQuery();
    await ctx.reply("✏️ Введите калории (ккал), например: `420`", { parse_mode: "Markdown" });
  });

  bot.callbackQuery("meal:discard", async (ctx) => {
    pendingMeals.delete(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply("Окей, не добавляю в статистику.");
  });
}

export async function handlePendingMealText(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  if (!userId || !text || text.startsWith("/")) return false;

  const pending = getFreshPending(userId);
  if (!pending?.editStep) return false;

  const value = parsePositiveNumber(text);
  if (value == null) {
    await ctx.reply("Введите положительное число, например: `120` или `12.5`", { parse_mode: "Markdown" });
    return true;
  }

  switch (pending.editStep) {
    case "calories":
      pending.meal.calories = Math.round(value);
      pending.editStep = "protein";
      await ctx.reply("🥩 Введите белки (г), например: `30`", { parse_mode: "Markdown" });
      return true;
    case "protein":
      pending.meal.macros.proteinG = round1(value);
      pending.editStep = "fat";
      await ctx.reply("🧈 Введите жиры (г), например: `12`", { parse_mode: "Markdown" });
      return true;
    case "fat":
      pending.meal.macros.fatG = round1(value);
      pending.editStep = "carbs";
      await ctx.reply("🍞 Введите углеводы (г), например: `45`", { parse_mode: "Markdown" });
      return true;
    case "carbs":
      pending.meal.macros.carbsG = round1(value);
      pending.editStep = undefined;
      pending.expiresAt = Date.now() + PENDING_TTL_MS;
      await ctx.reply(formatPendingMealSummary(pending.meal, pending.showMicronutrients), {
        parse_mode: "Markdown",
        reply_markup: mealConfirmationKeyboard(),
      });
      return true;
  }
}

export function getPendingMealForTest(userId: number): MealEntry | undefined {
  return getFreshPending(userId)?.meal;
}

export function clearPendingMealsForTest(): void {
  pendingMeals.clear();
}

async function confirmPendingMeal(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const pending = getFreshPending(userId);
  if (!pending) {
    await ctx.reply("⏳ Черновик анализа устарел. Отправьте фото ещё раз.");
    return;
  }

  const store = getStore();
  await store.addMeal(pending.meal);
  pendingMeals.delete(userId);

  const result = {
    dishName: pending.meal.dishName,
    calories: pending.meal.calories,
    macros: pending.meal.macros,
    advice: pending.meal.advice ?? "Добавлено в статистику дня.",
    micronutrients: pending.meal.micronutrients,
  };

  await ctx.reply(formatMealCard(result, pending.showMicronutrients), {
    parse_mode: "Markdown",
    reply_markup: afterMealKeyboard(),
  });
  await notifyCalorieGoalIfNeeded(ctx, userId, pending.meal.createdAt.slice(0, 10));
}

function getFreshPending(userId: number): PendingMeal | undefined {
  const pending = pendingMeals.get(userId);
  if (!pending) return undefined;
  if (pending.expiresAt < Date.now()) {
    pendingMeals.delete(userId);
    return undefined;
  }
  return pending;
}

function parsePositiveNumber(text: string): number | null {
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
