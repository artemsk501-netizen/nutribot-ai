import { randomUUID } from "node:crypto";
import type { Context } from "grammy";
import { analyzeFoodFromPhoto, analyzeFoodFromText } from "../../services/foodAnalysis.js";
import { FoodAnalysisError } from "../../services/foodAnalysisErrors.js";
import { getPremiumPlan, hasPremiumFeature } from "../../services/premium.js";
import { getStore } from "../../services/store.js";
import { ensureUser } from "../helpers/user.js";
import type { MealEntry } from "../../types/index.js";
import { afterMealKeyboard, upgradeKeyboard } from "../keyboards.js";
import { ANALYZING_TEXT, formatMealCard } from "../messages.js";
import { formatUsageCounter, LIMIT_REACHED_MESSAGE } from "../../services/usageLimits.js";
import { nowInBotDayISO, todayISO } from "../../utils/date.js";

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

  await store.addMeal(meal);
  const usage = photoFileId
    ? await store.incrementUsage(userId, "photo_scan", meal.createdAt.slice(0, 10))
    : undefined;
  await store.upsertUser({
    telegramId: userId,
    firstName: ctx.from?.first_name,
    languageCode: ctx.from?.language_code,
  });

  const card = usage
    ? `${formatMealCard(result, showMicronutrients)}\n\n${formatUsageCounter(usage)}`
    : formatMealCard(result, showMicronutrients);
  const markup = { parse_mode: "Markdown" as const, reply_markup: afterMealKeyboard() };

  if (photoFileId) {
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => undefined);
    await ctx.replyWithPhoto(photoFileId, { caption: card, ...markup });
  } else {
    await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, card, markup);
  }

  await notifyCalorieGoalIfNeeded(ctx, userId, meal.createdAt.slice(0, 10));
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
