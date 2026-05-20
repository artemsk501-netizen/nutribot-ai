import { randomUUID } from "node:crypto";
import type { Bot, Context } from "grammy";
import { getUserLocale, t, tSync } from "../../i18n/index.js";
import { getStore } from "../../services/store.js";
import { ensureUser } from "../helpers/user.js";
import { waterMenuKeyboard, waterReminderKeyboard } from "../keyboards.js";
import { todayISO } from "../../utils/date.js";

type WaterInputMode = "goal" | "interval" | "quiet" | "custom";

const pendingWaterInput = new Map<number, WaterInputMode>();

export function registerWater(bot: Bot): void {
  bot.command("water", async (ctx) => {
    await ensureUser(ctx);
    await sendWaterMenu(ctx);
  });

  bot.command("waterstats", async (ctx) => {
    await ensureUser(ctx);
    await sendWaterStats(ctx);
  });

  bot.callbackQuery("water:enable", async (ctx) => {
    const userId = ctx.from.id;
    await getStore().setWaterSettings(userId, { remindersEnabled: true });
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(userId, "water_enabled", undefined, ctx.from.language_code));
    await sendWaterMenu(ctx);
  });

  bot.callbackQuery("water:disable", async (ctx) => {
    const userId = ctx.from.id;
    await getStore().setWaterSettings(userId, { remindersEnabled: false });
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(userId, "water_disabled", undefined, ctx.from.language_code));
    await sendWaterMenu(ctx);
  });

  bot.callbackQuery("water:goal", async (ctx) => {
    pendingWaterInput.set(ctx.from.id, "goal");
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(ctx.from.id, "water_enter_goal", undefined, ctx.from.language_code));
  });

  bot.callbackQuery("water:interval", async (ctx) => {
    pendingWaterInput.set(ctx.from.id, "interval");
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(ctx.from.id, "water_enter_interval", undefined, ctx.from.language_code));
  });

  bot.callbackQuery("water:quiet", async (ctx) => {
    pendingWaterInput.set(ctx.from.id, "quiet");
    await ctx.answerCallbackQuery();
    await ctx.reply(await t(ctx.from.id, "water_enter_quiet", undefined, ctx.from.language_code));
  });

  bot.callbackQuery("water:stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendWaterStats(ctx);
  });

  bot.callbackQuery(/^water:log:(150|250|500|custom)$/, async (ctx) => {
    const userId = ctx.from.id;
    const amount = ctx.match![1];
    await ctx.answerCallbackQuery();
    if (amount === "custom") {
      pendingWaterInput.set(userId, "custom");
      await ctx.reply(await t(userId, "water_enter_custom", undefined, ctx.from.language_code));
      return;
    }
    await logWater(ctx, Number(amount));
  });

  bot.callbackQuery("water:reminder:done", async (ctx) => {
    await ctx.answerCallbackQuery({ text: await t(ctx.from.id, "water_reminder_done") });
    await logWater(ctx, 250);
  });

  bot.callbackQuery("water:reminder:later", async (ctx) => {
    const now = new Date().toISOString();
    await getStore().markWaterReminderSent(ctx.from.id, now);
    await ctx.answerCallbackQuery({ text: await t(ctx.from.id, "water_reminder_later") });
  });

  bot.callbackQuery("water:reminder:off", async (ctx) => {
    await getStore().setWaterSettings(ctx.from.id, { remindersEnabled: false });
    await ctx.answerCallbackQuery({ text: await t(ctx.from.id, "water_disabled") });
  });
}

export async function handleWaterText(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const text = ctx.message?.text?.trim();
  const mode = userId ? pendingWaterInput.get(userId) : undefined;
  if (!userId || !text || !mode) return false;

  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const store = getStore();

  if (mode === "goal") {
    const goal = parseInt(text, 10);
    if (!Number.isFinite(goal) || goal < 500 || goal > 5000) {
      await ctx.reply(tSync(locale, "water_goal_invalid"));
      return true;
    }
    await store.setWaterSettings(userId, { goalMl: goal });
    pendingWaterInput.delete(userId);
    await ctx.reply(tSync(locale, "water_goal_set", { goal }));
    return true;
  }

  if (mode === "interval") {
    const hours = parseInt(text, 10);
    if (!Number.isFinite(hours) || hours < 1 || hours > 12) {
      await ctx.reply(tSync(locale, "water_interval_invalid"));
      return true;
    }
    await store.setWaterSettings(userId, { intervalHours: hours });
    pendingWaterInput.delete(userId);
    await ctx.reply(tSync(locale, "water_interval_set", { hours }));
    return true;
  }

  if (mode === "quiet") {
    const match = text.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
    if (!match) {
      await ctx.reply(tSync(locale, "water_enter_quiet"));
      return true;
    }
    await store.setWaterSettings(userId, { quietStart: match[1]!, quietEnd: match[2]! });
    pendingWaterInput.delete(userId);
    await ctx.reply(tSync(locale, "water_quiet_set", { start: match[1]!, end: match[2]! }));
    return true;
  }

  if (mode === "custom") {
    const ml = parseInt(text, 10);
    if (!Number.isFinite(ml) || ml < 50 || ml > 2000) {
      await ctx.reply(tSync(locale, "water_custom_invalid"));
      return true;
    }
    pendingWaterInput.delete(userId);
    await logWater(ctx, ml);
    return true;
  }

  return false;
}

async function logWater(ctx: Context, amountMl: number): Promise<void> {
  const userId = ctx.from!.id;
  const now = new Date().toISOString();
  const store = getStore();
  await store.addWaterLog({
    id: randomUUID(),
    userId,
    amountMl,
    createdAt: now,
  });
  await store.touchWaterActivity(userId, now);
  const stats = await store.getWaterDayStats(userId, todayISO());
  const locale = await getUserLocale(userId, ctx.from?.language_code);
  await ctx.reply(
    tSync(locale, "water_logged", {
      amount: amountMl,
      today: stats.totalMl,
      goal: stats.goalMl,
    }),
    { parse_mode: "Markdown" },
  );
}

async function sendWaterMenu(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  const user = await getStore().getUser(userId);
  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const stats = await getStore().getWaterDayStats(userId, todayISO());
  const enabled = user?.water?.remindersEnabled ?? false;
  const status = enabled ? "on" : "off";
  await ctx.reply(
    tSync(locale, "water_title", { goal: stats.goalMl, today: stats.totalMl, status }),
    { parse_mode: "Markdown", reply_markup: waterMenuKeyboard(locale, enabled) },
  );
}

async function sendWaterStats(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  const locale = await getUserLocale(userId, ctx.from?.language_code);
  const date = todayISO();
  const stats = await getStore().getWaterDayStats(userId, date);
  const pct = stats.goalMl > 0 ? Math.min(100, Math.round((stats.totalMl / stats.goalMl) * 100)) : 0;
  await ctx.reply(
    tSync(locale, "water_stats", {
      date,
      total: stats.totalMl,
      goal: stats.goalMl,
      pct,
      count: stats.logCount,
    }),
    { parse_mode: "Markdown" },
  );
}

export { waterReminderKeyboard };
