import type { Context } from "grammy";
import { answerNutritionQuestion } from "../../services/aiAssistant.js";
import { getStore } from "../../services/store.js";
import { formatUsageCounter, LIMIT_REACHED_MESSAGE } from "../../services/usageLimits.js";
import { todayISO, shiftDate } from "../../utils/date.js";
import { upgradeKeyboard } from "../keyboards.js";
import { ensureUser } from "../helpers/user.js";

export async function handleNutritionText(ctx: Context): Promise<void> {
  const text = ctx.message?.text?.trim();
  const userId = ctx.from?.id;
  if (!text || !userId || text.startsWith("/")) return;

  const store = getStore();
  const user = (await ensureUser(ctx)) ?? (await store.getUser(userId));
  const date = todayISO();
  const usage = await store.getUsageStatus(userId, "ai_message", date);
  if (!usage.allowed) {
    await ctx.reply(LIMIT_REACHED_MESSAGE, { parse_mode: "Markdown", reply_markup: upgradeKeyboard() });
    return;
  }

  await ctx.replyWithChatAction("typing");
  const statusMsg = await ctx.reply("💬 Думаю над рекомендацией...");

  try {
    const [today, weightHistory] = await Promise.all([
      store.getDayStats(userId, date),
      store.getWeightHistory(userId, 30),
    ]);
    const recentMeals = await store.getMealsBetween(userId, shiftDate(date, -3), date);
    const result = await answerNutritionQuestion(text, {
      user,
      today: { ...today, meals: recentMeals.slice(-6) },
      weightHistory,
    });
    const afterUsage = await store.incrementUsage(userId, "ai_message", date);
    const counter = formatUsageCounter(afterUsage);
    await ctx.api
      .editMessageText(ctx.chat!.id, statusMsg.message_id, `${result.text}\n\n${counter}`)
      .catch(() => ctx.reply(`${result.text}\n\n${counter}`));
  } catch (err) {
    console.error("AI chat error:", err);
    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        "⚠️ AI-коуч временно недоступен. Попробуйте ещё раз через минуту.",
      )
      .catch(() => ctx.reply("⚠️ AI-коуч временно недоступен. Попробуйте ещё раз через минуту."));
  }
}

export async function handleUnsupportedFile(ctx: Context): Promise<void> {
  await ctx.reply(
    "📎 Пока я понимаю фото еды и текстовые вопросы про питание.\n\n" +
      "Отправьте фото блюда или спросите, например: `Как добрать белок сегодня?`",
    { parse_mode: "Markdown" },
  );
}
