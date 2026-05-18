import type { Bot, Context } from "grammy";
import { randomUUID } from "node:crypto";
import { getStore } from "../../services/store.js";
import type { WeightEntry } from "../../types/index.js";
import { ensureUser } from "../helpers/user.js";
import { formatWeightHistory, formatWeightLogged } from "../messages.js";

export function registerWeightCommands(bot: Bot): void {
  bot.command("weight", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const text = ctx.message?.text?.replace(/^\/weight\s*/i, "").trim() ?? "";
    const store = getStore();

    if (!text) {
      const history = await store.getWeightHistory(user.telegramId, 30);
      await ctx.reply(formatWeightHistory(history, user.goal?.targetWeightKg), {
        parse_mode: "Markdown",
      });
      return;
    }

    const weight = parseWeight(text);
    if (weight == null) {
      await ctx.reply("⚖️ Укажите вес в кг:\n`/weight 72.5`", { parse_mode: "Markdown" });
      return;
    }

    await store.addWeightEntry({
      id: randomUUID(),
      userId: user.telegramId,
      weightKg: weight,
      createdAt: new Date().toISOString(),
    });

    const history = await store.getWeightHistory(user.telegramId, 30);
    await ctx.reply(formatWeightLogged(weight, history, user.goal?.targetWeightKg), {
      parse_mode: "Markdown",
    });
  });

  bot.hears(/^(\d{2,3}(?:[.,]\d{1,2})?)\s*кг?$/i, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const match = ctx.match![1]!.replace(",", ".");
    const weight = parseFloat(match);
    if (weight < 30 || weight > 300) return;

    await ctx.reply(`Записать **${weight}** кг?`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "✅ Да", callback_data: `weight:log:${weight}` }]],
      },
    });
  });

  bot.callbackQuery(/^weight:log:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const weight = parseFloat(ctx.match![1]!);
    const store = getStore();

    await store.addWeightEntry({
      id: randomUUID(),
      userId,
      weightKg: weight,
      createdAt: new Date().toISOString(),
    });

    const user = await store.getUser(userId);
    const history = await store.getWeightHistory(userId, 30);

    await ctx.answerCallbackQuery({ text: "Вес записан!" });
    await ctx.editMessageText(formatWeightLogged(weight, history, user?.goal?.targetWeightKg), {
      parse_mode: "Markdown",
    });
  });
}

function parseWeight(text: string): number | null {
  const m = text.match(/(\d{2,3}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(",", "."));
  if (n < 30 || n > 300) return null;
  return Math.round(n * 10) / 10;
}
