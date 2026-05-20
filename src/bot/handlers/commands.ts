import type { Bot, Context } from "grammy";
import { config } from "../../config.js";
import { getUserLocale, t, tSync } from "../../i18n/index.js";
import { hasPremiumFeature } from "../../services/premium.js";
import { getStore } from "../../services/store.js";
import type { GoalType, UserGoal } from "../../types/index.js";
import { todayISO } from "../../utils/date.js";
import { ensureUser } from "../helpers/user.js";
import { goalTypeKeyboard, premiumKeyboard, replyMenu, statsKeyboard, welcomeKeyboard } from "../keyboards.js";
import {
  formatDayStats,
  formatAdminMetrics,
  formatGoalSummary,
  formatMonthStats,
  formatNotifyToggle,
  formatReferralStats,
  formatWeekStats,
  goalLabel,
  GOAL_PROMPT,
} from "../messages.js";
import { isAdmin } from "../middleware.js";
import { handleNutritionText, handleUnsupportedFile } from "./aiChat.js";
import { menuButtonTexts, promptLanguageIfNeeded, sendLanguageSettings } from "./language.js";
import { handlePendingMealText, handlePhoto } from "./meal.js";
import { formatProfile, restartOnboardingStep, startOrResumeOnboarding } from "./onboarding.js";
import { formatPremiumMenu } from "./payments.js";
import { handleWaterText } from "./water.js";

const DEFAULT_GOALS: Record<GoalType, UserGoal> = {
  lose: { type: "lose", dailyCalories: 1800 },
  gain: { type: "gain", dailyCalories: 2800 },
  maintain: { type: "maintain", dailyCalories: 2200 },
};

export function registerCommands(bot: Bot): void {
  bot.command("appss_verify", async (ctx) => {
    await ctx.reply("appss_2c33cd");
  });

  bot.command("start", async (ctx) => {
    const user = await ensureUser(ctx);
    const payload = ctx.message?.text?.replace(/^\/start\s*/i, "").trim();
    const referrerId = parseReferralPayload(payload);
    if (user && referrerId) {
      const registered = await getStore().registerReferral(referrerId, user.telegramId);
      if (registered) {
        await ctx.reply(await t(user.telegramId, "referral_accepted", undefined, ctx.from?.language_code));
      }
    }
    if (user) {
      if (await promptLanguageIfNeeded(ctx)) return;
      await startOrResumeOnboarding(ctx, user);
      return;
    }
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(tSync(locale, "welcome"), {
      parse_mode: "Markdown",
      reply_markup: welcomeKeyboard(locale),
    });
  });

  bot.command("help", async (ctx) => {
    await ensureUser(ctx);
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(tSync(locale, "help"), { parse_mode: "Markdown" });
  });

  bot.command("premium", async (ctx) => {
    await ensureUser(ctx);
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(formatPremiumMenu(), {
      parse_mode: "Markdown",
      reply_markup: premiumKeyboard(locale),
    });
  });

  bot.command("referral", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const stats = await getStore().getReferralStats(user.telegramId, config.BOT_USERNAME);
    await ctx.reply(formatReferralStats(stats), { parse_mode: "Markdown" });
  });

  bot.command("profile", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;
    const locale = await getUserLocale(user.telegramId, ctx.from?.language_code);
    await ctx.reply(formatProfile(user), { parse_mode: "Markdown", reply_markup: replyMenu(locale) });
  });

  bot.command("editgoal", async (ctx) => {
    await restartOnboardingStep(ctx, "goal");
  });

  bot.command("editweight", async (ctx) => {
    await restartOnboardingStep(ctx, "current_weight");
  });

  bot.command("editactivity", async (ctx) => {
    await restartOnboardingStep(ctx, "activity");
  });

  bot.command("photo", async (ctx) => {
    await ensureUser(ctx);
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(tSync(locale, "photo_prompt"), { parse_mode: "Markdown", reply_markup: replyMenu(locale) });
  });

  bot.command("stats", async (ctx) => {
    await ensureUser(ctx);
    await sendDayStats(ctx);
  });

  bot.command("month", async (ctx) => {
    await ensureUser(ctx);
    await sendMonthStats(ctx);
  });

  bot.command("notify", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const arg = ctx.message?.text?.replace(/^\/notify\s*/i, "").trim().toLowerCase();
    if (arg === "daily") {
      const enabled = !(user.dailyRemindersEnabled ?? true);
      await getStore().upsertUser({ telegramId: user.telegramId, dailyRemindersEnabled: enabled });
      await ctx.reply(
        enabled
          ? "🔔 **Ежедневные напоминания включены**\n\nВечером напомню свериться с целью калорий."
          : "🔕 **Ежедневные напоминания отключены**\n\nВключить: `/notify daily`",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const enabled = !(user.weeklyReportsEnabled ?? true);
    await getStore().setWeeklyReportsEnabled(user.telegramId, enabled);
    await ctx.reply(formatNotifyToggle(enabled), { parse_mode: "Markdown" });
  });

  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) {
      const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
      await ctx.reply(tSync(locale, "admin_only"));
      return;
    }

    const metrics = await getStore().getAdminMetrics();
    await ctx.reply(formatAdminMetrics(metrics), { parse_mode: "Markdown" });
  });

  bot.command("week", async (ctx) => {
    await ensureUser(ctx);
    await sendWeekStats(ctx);
  });

  bot.command("goal", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const text = ctx.message?.text?.replace(/^\/goal\s*/i, "").trim() ?? "";
    const parsed = parseGoalCommand(text, user.goal);

    if (parsed) {
      const saved = await getStore().setGoal(user.telegramId, parsed);
      await ctx.reply(
        `✅ **Цель обновлена**\n\n${formatGoalSummary(saved.goal!)}`,
        {
          parse_mode: "Markdown",
          reply_markup: replyMenu(await getUserLocale(user.telegramId, ctx.from?.language_code)),
        },
      );
      return;
    }

    const locale = await getUserLocale(user.telegramId, ctx.from?.language_code);
    if (user.goal) {
      await ctx.reply(
        `📌 **Текущая цель**\n\n${formatGoalSummary(user.goal)}\n\nИзменить:`,
        { parse_mode: "Markdown", reply_markup: goalTypeKeyboard(locale) },
      );
      return;
    }

    await ctx.reply(GOAL_PROMPT, { parse_mode: "Markdown", reply_markup: goalTypeKeyboard(locale) });
  });

  bot.command("target", async (ctx) => {
    const user = await ensureUser(ctx);
    if (!user) return;

    const text = ctx.message?.text?.replace(/^\/target\s*/i, "").trim() ?? "";
    const weight = parseFloat(text.replace(",", "."));
    if (!text || Number.isNaN(weight) || weight < 30 || weight > 300) {
      await ctx.reply("🎯 Укажите целевой вес:\n`/target 70`", { parse_mode: "Markdown" });
      return;
    }
    if (!user.goal) {
      await ctx.reply("Сначала задайте цель: /goal", { parse_mode: "Markdown" });
      return;
    }

    const rounded = Math.round(weight * 10) / 10;
    const saved = await getStore().upsertUser({
      telegramId: user.telegramId,
      goal: { ...user.goal, targetWeightKg: rounded },
    });

    await ctx.reply(
      `✅ **Целевой вес:** ${rounded} кг\n\n${formatGoalSummary(saved.goal!)}`,
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery(/^goal:(lose|gain|maintain)$/, async (ctx) => {
    const type = ctx.match![1] as GoalType;
    const userId = ctx.from?.id;
    if (!userId) return;

    const goal = DEFAULT_GOALS[type];
    const saved = await getStore().setGoal(userId, goal);

    await ctx.answerCallbackQuery({ text: "Цель сохранена!" });
    await ctx.editMessageText(
      `✅ **Цель установлена**\n\n${formatGoalSummary(saved.goal!)}`,
      { parse_mode: "Markdown" },
    );
    const locale = await getUserLocale(userId, ctx.from?.language_code);
    await ctx.reply("👇", { reply_markup: replyMenu(locale) });
  });

  bot.callbackQuery("premium:show", async (ctx) => {
    await ctx.answerCallbackQuery();
    const locale = await getUserLocale(ctx.from.id, ctx.from.language_code);
    await ctx.reply(formatPremiumMenu(), {
      parse_mode: "Markdown",
      reply_markup: premiumKeyboard(locale),
    });
  });

  bot.on("message:photo", handlePhoto);
  bot.on(
    [
      "message:document",
      "message:video",
      "message:audio",
      "message:voice",
      "message:sticker",
      "message:animation",
    ],
    handleUnsupportedFile,
  );

  bot.hears(menuButtonTexts("btn_photo"), async (ctx) => {
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(tSync(locale, "photo_prompt"), { parse_mode: "Markdown" });
  });

  bot.hears(menuButtonTexts("btn_stats"), async (ctx) => {
    await ensureUser(ctx);
    await sendDayStats(ctx);
  });

  bot.hears(menuButtonTexts("btn_week"), async (ctx) => {
    await ensureUser(ctx);
    await sendWeekStats(ctx);
  });

  bot.hears(menuButtonTexts("btn_goal"), async (ctx) => {
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(GOAL_PROMPT, { parse_mode: "Markdown", reply_markup: goalTypeKeyboard(locale) });
  });

  bot.hears(menuButtonTexts("btn_help"), async (ctx) => {
    const locale = await getUserLocale(ctx.from!.id, ctx.from?.language_code);
    await ctx.reply(tSync(locale, "help"), { parse_mode: "Markdown" });
  });

  bot.hears(menuButtonTexts("btn_language"), async (ctx) => {
    await ensureUser(ctx);
    await sendLanguageSettings(ctx);
  });

  bot.on("message:text", async (ctx) => {
    if (await handleWaterText(ctx)) return;
    if (await handlePendingMealText(ctx)) return;
    await handleNutritionText(ctx);
  });
}

async function sendDayStats(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const store = getStore();
  const user = await store.getUser(userId);
  const premium = hasPremiumFeature(user, "micronutrients");
  const stats = await store.getDayStats(userId, todayISO(), {
    includeMicronutrients: premium,
  });

  await ctx.reply(formatDayStats(stats, premium), {
    parse_mode: "Markdown",
    reply_markup: statsKeyboard(),
  });
}

async function sendWeekStats(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const week = await getStore().getWeekStats(userId);
  const user = await getStore().getUser(userId);
  await ctx.reply(formatWeekStats(week, hasPremiumFeature(user, "weeklyReports")), {
    parse_mode: "Markdown",
    reply_markup: statsKeyboard(),
  });
}

async function sendMonthStats(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const store = getStore();
  const month = await store.getMonthStats(userId);
  const user = await store.getUser(userId);
  await ctx.reply(formatMonthStats(month, hasPremiumFeature(user, "advancedAnalytics")), {
    parse_mode: "Markdown",
    reply_markup: statsKeyboard(),
  });
}

function parseGoalCommand(text: string, current?: UserGoal): UserGoal | null {
  if (!text) return null;

  const lower = text.toLowerCase();
  if (lower === "lose" || lower === "похудеть" || lower === "похудение") {
    return { ...DEFAULT_GOALS.lose, targetWeightKg: current?.targetWeightKg };
  }
  if (lower === "gain" || lower === "набор" || lower === "масса") {
    return { ...DEFAULT_GOALS.gain, targetWeightKg: current?.targetWeightKg };
  }
  if (lower === "maintain" || lower === "поддержание") {
    return { ...DEFAULT_GOALS.maintain, targetWeightKg: current?.targetWeightKg };
  }

  const kcal = parseInt(text.replace(/\s/g, ""), 10);
  if (!Number.isNaN(kcal) && kcal >= 800 && kcal <= 6000) {
    return {
      type: current?.type ?? "maintain",
      dailyCalories: kcal,
      targetWeightKg: current?.targetWeightKg,
    };
  }

  return null;
}

export const BOT_COMMANDS = [
  { command: "start", description: "Start / welcome" },
  { command: "photo", description: "Send food photo" },
  { command: "stats", description: "Daily stats" },
  { command: "week", description: "Weekly report" },
  { command: "month", description: "Monthly report" },
  { command: "goal", description: "Calorie goal" },
  { command: "weight", description: "Log weight" },
  { command: "target", description: "Target weight" },
  { command: "water", description: "Water reminders" },
  { command: "waterstats", description: "Water stats" },
  { command: "notify", description: "Notifications" },
  { command: "premium", description: "Premium Stars" },
  { command: "referral", description: "Referral link" },
  { command: "profile", description: "Profile" },
  { command: "editgoal", description: "Edit goal" },
  { command: "editweight", description: "Edit weight" },
  { command: "editactivity", description: "Edit activity" },
  { command: "admin", description: "Admin metrics" },
  { command: "help", description: "Help" },
];

function parseReferralPayload(payload?: string): number | null {
  const match = payload?.match(/^ref_(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
