import { randomUUID } from "node:crypto";
import type { Bot, Context } from "grammy";
import { getUserLocale, t, tSync } from "../../i18n/index.js";
import { analyzeFoodFromPhoto, analyzeFoodFromText } from "../../services/foodAnalysis.js";
import { FoodAnalysisError } from "../../services/foodAnalysisErrors.js";
import { getPremiumPlan, hasPremiumFeature } from "../../services/premium.js";
import { buildMealFromAnalysis, applyPortionToMeal } from "../../services/portion.js";
import { getStore } from "../../services/store.js";
import type { Locale, MealEntry, PortionSize } from "../../types/index.js";
import { ensureUser } from "../helpers/user.js";
import {
  afterMealKeyboard,
  mealConfirmationKeyboard,
  mealPortionKeyboard,
  upgradeKeyboard,
} from "../keyboards.js";
import { formatMealCard, formatPendingMealSummary } from "../messages.js";
import { formatUsageCounter } from "../../services/usageLimits.js";
import { nowInBotDayISO, todayISO } from "../../utils/date.js";

type EditStep = "name" | "calories" | "protein" | "fat" | "carbs" | "grams";
type PendingPhase = "portion" | "confirm" | "grams_input";

interface PendingMeal {
  meal: MealEntry;
  showMicronutrients: boolean;
  expiresAt: number;
  phase: PendingPhase;
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

  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const user = (await ensureUser(ctx)) ?? (await getStore().getUser(userId));
  const showMicronutrients = hasPremiumFeature(user, "micronutrients");
  const store = getStore();

  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply(tSync(locale, "analyzing"));

  let result: import("../../types/index.js").FoodAnalysisResult;
  try {
    result = await analyze();
  } catch (err) {
    const text = formatAnalysisError(err, locale);
    await ctx.api
      .editMessageText(ctx.chat!.id, statusMsg.message_id, text, { parse_mode: "Markdown" })
      .catch(() => ctx.reply(text, { parse_mode: "Markdown" }));
    return;
  }

  const meal = buildMealFromAnalysis(result, userId, randomUUID(), photoFileId);
  meal.createdAt = nowInBotDayISO();

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
      phase: "portion",
    });
  }

  const summary = formatPendingMealSummary(meal, showMicronutrients, locale);
  const usageLine = usage ? `\n\n${formatUsageCounter(usage)}` : "";
  const card = `${summary}\n\n_${tSync(locale, "portion_question")}_${usageLine}`;
  const markup = {
    parse_mode: "Markdown" as const,
    reply_markup: photoFileId ? mealPortionKeyboard(locale) : afterMealKeyboard(locale),
  };

  if (photoFileId) {
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => undefined);
    await ctx.replyWithPhoto(photoFileId, { caption: card, ...markup });
  } else {
    await store.addMeal(meal);
    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, formatMealCard(result, showMicronutrients), {
      parse_mode: "Markdown",
      reply_markup: afterMealKeyboard(locale),
    });
    await notifyCalorieGoalIfNeeded(ctx, userId, meal.createdAt.slice(0, 10), locale);
  }
}

async function notifyCalorieGoalIfNeeded(
  ctx: Context,
  userId: number,
  date: string,
  locale: Locale,
): Promise<void> {
  const store = getStore();
  const user = await store.getUser(userId);
  const target = user?.goal?.dailyCalories;
  if (!target) return;

  const stats = await store.getDayStats(userId, date);
  if (stats.totalCalories <= target) return;

  await ctx.reply(
    tSync(locale, "goal_exceeded", {
      today: stats.totalCalories,
      target,
      over: stats.totalCalories - target,
    }),
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

function formatAnalysisError(err: unknown, locale: Locale): string {
  if (err instanceof FoodAnalysisError) {
    if (err.code === "NO_API_KEY") return tSync(locale, "analysis_no_api");
    return tSync(locale, "analysis_error", { message: err.message });
  }
  console.error("Food analysis error:", err);
  return tSync(locale, "analysis_error", { message: "unknown error" });
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

  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const usage = await store.getUsageStatus(userId, "photo_scan", todayISO());
  if (!usage.allowed) {
    await ctx.reply(tSync(locale, "limit_reached"), {
      parse_mode: "Markdown",
      reply_markup: upgradeKeyboard(locale),
    });
    return;
  }

  await processFoodAnalysis(
    ctx,
    async () => {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) {
        throw new FoodAnalysisError("Photo file unavailable", "DOWNLOAD_ERROR");
      }
      return analyzeFoodFromPhoto({ telegramFilePath: file.file_path }, caption, analyzeOptionsFromUser(user));
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
  bot.callbackQuery(/^meal:portion:(small|medium|large)$/, async (ctx) => {
    const pending = getFreshPending(ctx.from.id);
    if (!pending) {
      await ctx.answerCallbackQuery();
      await replyExpired(ctx);
      return;
    }
    const portion = ctx.match![1] as PortionSize;
    pending.meal = applyPortionToMeal(pending.meal, portion);
    pending.phase = "confirm";
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await ctx.answerCallbackQuery();
    await showConfirmStep(ctx, pending);
  });

  bot.callbackQuery("meal:portion:grams", async (ctx) => {
    const pending = getFreshPending(ctx.from.id);
    if (!pending) {
      await ctx.answerCallbackQuery();
      await replyExpired(ctx);
      return;
    }
    pending.phase = "grams_input";
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await ctx.answerCallbackQuery();
    const locale = await getUserLocale(ctx.from.id, ctx.from.language_code);
    await ctx.reply(tSync(locale, "portion_enter_grams"), { parse_mode: "Markdown" });
  });

  bot.callbackQuery("meal:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    await confirmPendingMeal(ctx);
  });

  bot.callbackQuery("meal:edit", async (ctx) => {
    const pending = getFreshPending(ctx.from.id);
    if (!pending) {
      await ctx.answerCallbackQuery();
      await replyExpired(ctx);
      return;
    }
    pending.editStep = "name";
    pending.phase = "confirm";
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await ctx.answerCallbackQuery();
    const locale = await getUserLocale(ctx.from.id, ctx.from.language_code);
    await ctx.reply(tSync(locale, "edit_name"));
  });

  bot.callbackQuery("meal:discard", async (ctx) => {
    pendingMeals.delete(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(ctx.from.id, "meal_discarded", undefined, ctx.from.language_code));
  });
}

export async function handlePendingMealText(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  if (!userId || !text || text.startsWith("/")) return false;

  const pending = getFreshPending(userId);
  if (!pending) return false;

  const locale = await getUserLocale(userId, ctx.from?.language_code);

  if (pending.phase === "grams_input") {
    const grams = parseInt(text.replace(/\s/g, ""), 10);
    if (!Number.isFinite(grams) || grams < 1 || grams > 3000) {
      await ctx.reply(tSync(locale, "portion_grams_invalid"));
      return true;
    }
    pending.meal = applyPortionToMeal(pending.meal, "custom", grams);
    pending.phase = "confirm";
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await showConfirmStep(ctx, pending);
    return true;
  }

  if (!pending.editStep) return false;

  if (pending.editStep === "name") {
    pending.meal.dishName = text.slice(0, 120);
    pending.meal.source = "user_corrected";
    pending.editStep = "calories";
    await ctx.reply(tSync(locale, "edit_calories"), { parse_mode: "Markdown" });
    return true;
  }

  const value = parsePositiveNumber(text);
  if (value == null) {
    await ctx.reply(tSync(locale, "edit_invalid_number"), { parse_mode: "Markdown" });
    return true;
  }

  switch (pending.editStep) {
    case "calories":
      pending.meal.calories = Math.round(value);
      pending.editStep = "protein";
      await ctx.reply(tSync(locale, "edit_protein"), { parse_mode: "Markdown" });
      return true;
    case "protein":
      pending.meal.macros.proteinG = round1(value);
      pending.editStep = "fat";
      await ctx.reply(tSync(locale, "edit_fat"), { parse_mode: "Markdown" });
      return true;
    case "fat":
      pending.meal.macros.fatG = round1(value);
      pending.editStep = "carbs";
      await ctx.reply(tSync(locale, "edit_carbs"), { parse_mode: "Markdown" });
      return true;
    case "carbs":
      pending.meal.macros.carbsG = round1(value);
      pending.editStep = "grams";
      await ctx.reply(tSync(locale, "edit_grams"), { parse_mode: "Markdown" });
      return true;
    case "grams": {
      const grams = Math.round(value);
      if (grams < 1 || grams > 3000) {
        await ctx.reply(tSync(locale, "portion_grams_invalid"));
        return true;
      }
      pending.meal = applyPortionToMeal(
        { ...pending.meal, source: "user_corrected" },
        "custom",
        grams,
      );
      pending.editStep = undefined;
      pending.phase = "confirm";
      pending.expiresAt = Date.now() + PENDING_TTL_MS;
      await showConfirmStep(ctx, pending);
      return true;
    }
  }
}

export function getPendingMealForTest(userId: number): MealEntry | undefined {
  return getFreshPending(userId)?.meal;
}

export function clearPendingMealsForTest(): void {
  pendingMeals.clear();
}

async function showConfirmStep(ctx: Context, pending: PendingMeal): Promise<void> {
  const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
  const summary = formatPendingMealSummary(pending.meal, pending.showMicronutrients, locale);
  const text = `${summary}\n\n**${tSync(locale, "meal_confirm_question")}**`;
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: mealConfirmationKeyboard(locale),
  });
}

async function confirmPendingMeal(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const pending = getFreshPending(userId);
  if (!pending) {
    await replyExpired(ctx);
    return;
  }

  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const store = getStore();
  await store.addMeal(pending.meal);
  pendingMeals.delete(userId);

  const result = {
    dishName: pending.meal.dishName,
    calories: pending.meal.calories,
    macros: pending.meal.macros,
    advice: pending.meal.advice ?? tSync(locale, "meal_added"),
    micronutrients: pending.meal.micronutrients,
  };

  await ctx.reply(formatMealCard(result, pending.showMicronutrients), {
    parse_mode: "Markdown",
    reply_markup: afterMealKeyboard(locale),
  });
  await notifyCalorieGoalIfNeeded(ctx, userId, pending.meal.createdAt.slice(0, 10), locale);
}

async function replyExpired(ctx: Context): Promise<void> {
  await ctx.reply(await t(ctx.from!.id, "meal_draft_expired", undefined, ctx.from?.language_code));
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
