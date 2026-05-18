import { randomUUID } from "node:crypto";
import type { Bot, Context } from "grammy";
import {
  calculateNutritionTargets,
  canCalculateTargets,
  isNutritionProfileComplete,
  parseNumberInRange,
} from "../../services/nutritionGoals.js";
import { getStore } from "../../services/store.js";
import type { ActivityLevel, GoalType, OnboardingStep, UserProfile } from "../../types/index.js";
import { activityKeyboard, onboardingGoalKeyboard, replyMenu } from "../keyboards.js";
import { formatGoalSummary } from "../messages.js";

const GOAL_LABEL: Record<GoalType, string> = {
  lose: "похудение",
  gain: "набор массы",
  maintain: "поддержание веса",
};

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  low: "низкая",
  medium: "средняя",
  high: "высокая",
};

export function registerOnboarding(bot: Bot): void {
  bot.callbackQuery(/^onboarding:start$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = await ensureOnboardingUser(ctx, "goal");
    if (!user) return;
    await askGoal(ctx, true);
  });

  bot.callbackQuery(/^onboarding:goal:(lose|gain|maintain)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const type = ctx.match![1] as GoalType;
    await getStore().upsertUser({
      telegramId: userId,
      goal: { type, dailyCalories: 0 },
      onboardingStep: "current_weight",
      onboardingComplete: false,
    });
    await ctx.answerCallbackQuery({ text: "Цель сохранена" });
    await ctx.editMessageText(`🔥 Ваша цель: **${GOAL_LABEL[type]}**`, { parse_mode: "Markdown" });
    await ctx.reply("⚖️ Введите ваш текущий вес (кг)", { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^onboarding:activity:(low|medium|high)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const activityLevel = ctx.match![1] as ActivityLevel;
    await getStore().upsertUser({
      telegramId: userId,
      activityLevel,
      onboardingStep: "activity",
      onboardingComplete: false,
    });
    await ctx.answerCallbackQuery({ text: "Активность сохранена" });
    await finishOnboarding(ctx, userId);
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      await next();
      return;
    }

    const user = ctx.from?.id ? await getStore().getUser(ctx.from.id) : undefined;
    if (!user || user.onboardingComplete || !user.onboardingStep || user.onboardingStep === "complete") {
      await next();
      return;
    }

    await handleOnboardingText(ctx, user, text);
  });
}

export async function startOrResumeOnboarding(ctx: Context, user: UserProfile): Promise<void> {
  if (isNutritionProfileComplete(user)) {
    await ctx.reply(
      "👋 Вы уже настроили профиль.\n\nОтправьте фото еды для анализа или используйте /profile.",
      { parse_mode: "Markdown", reply_markup: replyMenu },
    );
    return;
  }

  const step = nextMissingStep(user);
  await getStore().upsertUser({
    telegramId: user.telegramId,
    onboardingStep: step,
    onboardingComplete: false,
  });
  await sendPromptForStep(ctx, step);
}

export async function restartOnboardingStep(ctx: Context, step: OnboardingStep): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  await getStore().upsertUser({ telegramId: userId, onboardingStep: step, onboardingComplete: false });
  await sendPromptForStep(ctx, step);
}

export function formatProfile(user: UserProfile): string {
  const goal = user.goal ? formatGoalSummary(user.goal) : "Цель не задана";
  return (
    "👤 **Ваш профиль**\n" +
    "━━━━━━━━━━━━━━\n" +
    `${goal}\n\n` +
    `⚖️ Текущий вес: **${user.currentWeightKg ?? "-"}** кг\n` +
    `🎯 Желаемый вес: **${user.targetWeightKg ?? user.goal?.targetWeightKg ?? "-"}** кг\n` +
    `📏 Рост: **${user.heightCm ?? "-"}** см\n` +
    `🎂 Возраст: **${user.age ?? "-"}**\n` +
    `🏃 Активность: **${user.activityLevel ? ACTIVITY_LABEL[user.activityLevel] : "-"}**\n\n` +
    `**БЖУ цель**\n` +
    `🥩 Белки: **${user.proteinGoalG ?? "-"}** г\n` +
    `🧈 Жиры: **${user.fatGoalG ?? "-"}** г\n` +
    `🍞 Углеводы: **${user.carbsGoalG ?? "-"}** г`
  );
}

async function handleOnboardingText(ctx: Context, user: UserProfile, text: string): Promise<void> {
  const step = user.onboardingStep;
  if (!step) return;

  if (step === "current_weight") {
    const weight = parseNumberInRange(text, 30, 300);
    if (weight == null) {
      await ctx.reply("⚠️ Введите вес числом от 30 до 300 кг. Например: `72.5`", { parse_mode: "Markdown" });
      return;
    }
    await getStore().upsertUser({ telegramId: user.telegramId, currentWeightKg: weight, onboardingStep: "target_weight" });
    await getStore().addWeightEntry({
      id: randomUUID(),
      userId: user.telegramId,
      weightKg: weight,
      createdAt: new Date().toISOString(),
    });
    await ctx.reply("🎯 Введите желаемый вес (кг)", { parse_mode: "Markdown" });
    return;
  }

  if (step === "target_weight") {
    const target = parseNumberInRange(text, 30, 300);
    if (target == null) {
      await ctx.reply("⚠️ Введите желаемый вес числом от 30 до 300 кг.", { parse_mode: "Markdown" });
      return;
    }
    await getStore().upsertUser({
      telegramId: user.telegramId,
      targetWeightKg: target,
      goal: user.goal ? { ...user.goal, targetWeightKg: target } : undefined,
      onboardingStep: "height",
    });
    await ctx.reply("📏 Введите ваш рост (см)", { parse_mode: "Markdown" });
    return;
  }

  if (step === "height") {
    const height = parseNumberInRange(text, 100, 250);
    if (height == null) {
      await ctx.reply("⚠️ Введите рост числом от 100 до 250 см. Например: `170`", { parse_mode: "Markdown" });
      return;
    }
    await getStore().upsertUser({ telegramId: user.telegramId, heightCm: Math.round(height), onboardingStep: "age" });
    await ctx.reply("🎂 Введите ваш возраст", { parse_mode: "Markdown" });
    return;
  }

  if (step === "age") {
    const age = parseNumberInRange(text, 12, 100);
    if (age == null) {
      await ctx.reply("⚠️ Введите возраст числом от 12 до 100.", { parse_mode: "Markdown" });
      return;
    }
    await getStore().upsertUser({ telegramId: user.telegramId, age: Math.round(age), onboardingStep: "activity" });
    await ctx.reply("🏃 Выберите ваш уровень активности:", {
      parse_mode: "Markdown",
      reply_markup: activityKeyboard(),
    });
  }
}

async function finishOnboarding(ctx: Context, userId: number): Promise<void> {
  const user = await getStore().getUser(userId);
  if (!canCalculateTargets(user)) {
    await ctx.reply("⚠️ Не хватает данных профиля. Продолжим настройку.");
    if (user) await startOrResumeOnboarding(ctx, user);
    return;
  }

  const targets = calculateNutritionTargets({
    goalType: user.goal.type,
    currentWeightKg: user.currentWeightKg,
    targetWeightKg: user.targetWeightKg,
    heightCm: user.heightCm,
    age: user.age,
    activityLevel: user.activityLevel,
  });

  const saved = await getStore().upsertUser({
    telegramId: userId,
    goal: {
      type: user.goal.type,
      targetWeightKg: user.targetWeightKg,
      dailyCalories: targets.dailyCalories,
    },
    proteinGoalG: targets.proteinGoalG,
    fatGoalG: targets.fatGoalG,
    carbsGoalG: targets.carbsGoalG,
    onboardingComplete: true,
    onboardingStep: "complete",
  });

  await ctx.reply(formatOnboardingSummary(saved), {
    parse_mode: "Markdown",
    reply_markup: replyMenu,
  });
}

function formatOnboardingSummary(user: UserProfile): string {
  const goalType = user.goal?.type ?? "maintain";
  return (
    `✅ **Профиль настроен**\n\n` +
    `🔥 Ваша цель: **${GOAL_LABEL[goalType]}**\n\n` +
    `📊 **Рекомендуемая норма:**\n` +
    `• **${user.goal?.dailyCalories ?? "-"}** ккал\n` +
    `• Белки: **${user.proteinGoalG ?? "-"}** г\n` +
    `• Жиры: **${user.fatGoalG ?? "-"}** г\n` +
    `• Углеводы: **${user.carbsGoalG ?? "-"}** г\n\n` +
    `🎯 Теперь отправьте фото еды для анализа.`
  );
}

async function sendPromptForStep(ctx: Context, step: OnboardingStep): Promise<void> {
  await ctx.replyWithChatAction("typing").catch(() => undefined);
  if (step === "goal") {
    await askGoal(ctx);
  } else if (step === "current_weight") {
    await ctx.reply("⚖️ Введите ваш текущий вес (кг)", { parse_mode: "Markdown" });
  } else if (step === "target_weight") {
    await ctx.reply("🎯 Введите желаемый вес (кг)", { parse_mode: "Markdown" });
  } else if (step === "height") {
    await ctx.reply("📏 Введите ваш рост (см)", { parse_mode: "Markdown" });
  } else if (step === "age") {
    await ctx.reply("🎂 Введите ваш возраст", { parse_mode: "Markdown" });
  } else if (step === "activity") {
    await ctx.reply("🏃 Выберите ваш уровень активности:", {
      parse_mode: "Markdown",
      reply_markup: activityKeyboard(),
    });
  }
}

function nextMissingStep(user: UserProfile): OnboardingStep {
  if (!user.goal?.type) return "goal";
  if (!user.currentWeightKg) return "current_weight";
  if (!user.targetWeightKg && !user.goal.targetWeightKg) return "target_weight";
  if (!user.heightCm) return "height";
  if (!user.age) return "age";
  if (!user.activityLevel) return "activity";
  return user.onboardingStep && user.onboardingStep !== "complete" ? user.onboardingStep : "activity";
}

async function askGoal(ctx: Context, edit = false): Promise<void> {
  const text = "🎯 **Какая у вас цель?**";
  const options = { parse_mode: "Markdown" as const, reply_markup: onboardingGoalKeyboard() };
  if (edit && ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, options);
    return;
  }
  await ctx.reply(text, options);
}

async function ensureOnboardingUser(ctx: Context, step: OnboardingStep): Promise<UserProfile | undefined> {
  const from = ctx.from;
  if (!from?.id) return undefined;
  return getStore().upsertUser({
    telegramId: from.id,
    firstName: from.first_name,
    languageCode: from.language_code,
    onboardingStep: step,
    onboardingComplete: false,
  });
}
