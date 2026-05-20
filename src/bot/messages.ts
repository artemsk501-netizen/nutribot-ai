import { tSync } from "../i18n/index.js";
import type { AdminMetrics, DayStats, FoodAnalysisResult, GoalType, Locale, MealEntry, MonthStats, ReferralStats, UserGoal, WeekStats } from "../types/index.js";
import { formatMicronutrients, formatMicronutrientsBrief } from "../services/micronutrients.js";
import { formatDateRu } from "../utils/date.js";

export const WELCOME_TEXT = `👋 **Добро пожаловать в NutriBot!**

Я ваш ИИ-помощник по питанию:
📷 сфотографируйте еду — посчитаю калории и БЖУ
📊 веду дневник и статистику
⚖️ помогаю следить за весом и целью

Нажмите **▶️ Старт**, чтобы выбрать цель, или сразу пришлите фото 🍳`;

export const HELP_TEXT = `📖 **Справка NutriBot**

**Основное**
📷 Фото еды — анализ, затем подтверждение записи в дневник
💬 Обычный текст — AI nutrition coach
/photo — подсказка по отправке фото

**Статистика**
/stats — сводка за сегодня 🔥
/week — отчёт за 7 дней 📅
/month — отчёт за 30 дней 🗓

**Цели**
/goal — цель и лимит калорий 🎯
/goal 2000 — свой лимит ккал/день
/target 70 — целевой вес (кг)
/profile — профиль и рассчитанная норма
/editgoal — изменить цель
/editweight — изменить вес
/editactivity — изменить активность

**Вес**
/weight — записать или посмотреть историю ⚖️
/weight 72.5 — записать вес

**Уведомления**
/notify — еженедельные отчёты вкл/выкл 🔔
/premium — тарифы Premium через Telegram Stars ⭐
/referral — ваша реферальная ссылка

**Лимиты Free**
📸 3 анализа фото/день
💬 3 AI вопроса/день

**Другое**
/start — главное меню
/help — эта справка

💡 Inline: \`@nutribot_ai борщ\` в любом чате`;

const GOAL_EMOJI: Record<GoalType, string> = {
  lose: "📉",
  gain: "📈",
  maintain: "⚖️",
};

const GOAL_LABEL: Record<GoalType, string> = {
  lose: "Похудение",
  gain: "Набор массы",
  maintain: "Поддержание",
};

export function goalLabel(type: GoalType): string {
  return GOAL_LABEL[type];
}

export function formatGoalSummary(goal: UserGoal): string {
  let text = `${GOAL_EMOJI[goal.type]} **${GOAL_LABEL[goal.type]}**\n🔥 Лимит: **${goal.dailyCalories}** ккал/день`;
  if (goal.targetWeightKg) {
    text += `\n🎯 Целевой вес: **${goal.targetWeightKg}** кг`;
  }
  return text;
}

export function formatMealCard(result: FoodAnalysisResult, premium = false): string {
  const { dishName, calories, macros, advice } = result;

  let text =
    `✅ **Записано в дневник**\n\n` +
    `🍽 **${escapeMd(dishName)}**\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔥 **${calories}** ккал\n` +
    `🥩 Белки **${macros.proteinG}** г  ·  ` +
    `🧈 Жиры **${macros.fatG}** г  ·  ` +
    `🍞 Углеводы **${macros.carbsG}** г`;

  if (premium && result.micronutrients) {
    text += formatMicronutrients(result.micronutrients);
  }

  text += `\n\n💡 _${escapeMd(advice)}_`;
  return text;
}

export function formatPendingMealSummary(
  meal: MealEntry,
  premium = false,
  locale: Locale = "en",
): string {
  let text =
    "📸 **Analysis ready**\n\n" +
    `🍽 **${escapeMd(meal.dishName)}**\n` +
    `🔥 **${meal.calories}** kcal\n` +
    `🥩 **${meal.macros.proteinG}** g · 🧈 **${meal.macros.fatG}** g · 🍞 **${meal.macros.carbsG}** g`;

  if (meal.grams) {
    text += `\n⚖️ ${tSync(locale, "grams_label")}: **${meal.grams}** g`;
  }
  if (meal.confidence != null) {
    text += `\n📊 ${tSync(locale, "confidence_label")}: **${Math.round(meal.confidence * 100)}%**`;
  }

  if (premium && meal.micronutrients) {
    text += formatMicronutrients(meal.micronutrients);
  }

  if (meal.advice) {
    text += `\n\n💡 _${escapeMd(meal.advice)}_`;
  }

  return text;
}

export function formatDayStats(stats: DayStats, premium = false): string {
  const target = stats.goal?.dailyCalories ?? 2000;
  const eaten = stats.totalCalories;
  const pct = Math.min(100, Math.round((eaten / target) * 100));
  const bar = progressBar(pct);
  const over = eaten > target;
  const remaining = stats.remainingCalories;

  const goalLine = stats.goal
    ? `${GOAL_EMOJI[stats.goal.type]} ${GOAL_LABEL[stats.goal.type]} · цель **${target}** ккал`
    : "🎯 Цель не задана — /goal";

  let statusEmoji = "✅";
  let statusText = `Осталось **${remaining}** ккал`;
  if (over) {
    statusEmoji = "⚠️";
    statusText = `Перебор **${eaten - target}** ккал`;
  } else if (pct >= 85) {
    statusEmoji = "🟡";
  }

  let text =
    `📅 **Сегодня** · ${formatDateRu(stats.date)}\n` +
    `${goalLine}\n\n` +
    `${bar} **${pct}%**\n` +
    `🔥 **${eaten}** / ${target} ккал\n` +
    `${statusEmoji} ${statusText}\n\n` +
    `**БЖУ за день**\n` +
    `🥩 ${stats.totalMacros.proteinG} г  ·  ` +
    `🧈 ${stats.totalMacros.fatG} г  ·  ` +
    `🍞 ${stats.totalMacros.carbsG} г`;

  if (premium && stats.totalMicronutrients) {
    text += formatMicronutrients(stats.totalMicronutrients).replace("(Premium)", "(сегодня)");
  }

  if (stats.meals.length > 0) {
    text += `\n\n🍽 **Приёмы пищи** (${stats.meals.length}):\n`;
    text += stats.meals
      .map((m, i) => {
        const time = m.createdAt.slice(11, 16);
        let line = `${i + 1}. ${escapeMd(m.dishName)} — **${m.calories}** ккал _${time}_`;
        if (premium && m.micronutrients) {
          line += formatMicronutrientsBrief(m.micronutrients);
        }
        return line;
      })
      .join("\n");
  } else {
    text += "\n\n📭 _Пока нет записей — отправьте фото еды!_";
  }

  return text;
}

export function formatWeekStats(week: WeekStats, extended = false): string {
  const target = week.goal?.dailyCalories ?? 2000;
  const activeDays = week.days.filter((d) => d.mealCount > 0).length;

  let text =
    `📊 **Недельный отчёт**\n` +
    `${formatDateRu(week.weekStart)} — ${formatDateRu(week.weekEnd)}\n` +
    `━━━━━━━━━━━━━━\n` +
    `🔥 Всего: **${week.totalCalories}** ккал\n` +
    `📈 В среднем: **${week.avgCaloriesPerDay}** ккал/день\n` +
    `🎯 Цель: **${target}** ккал/день\n` +
    `📆 Дней с записями: **${activeDays}** / 7\n\n` +
    `**По дням:**\n`;

  for (const day of week.days) {
    const label = formatDateRu(day.date).slice(0, 5);
    const pct = Math.min(100, Math.round((day.totalCalories / target) * 100));
    const bar = progressBar(pct);
    const icon = day.mealCount === 0 ? "⚪" : day.totalCalories > target ? "🔴" : "🟢";
    text += `${icon} ${label} ${bar} **${day.totalCalories}** ккал · ${day.mealCount} приём.\n`;
  }

  text +=
    `\n**БЖУ за неделю**\n` +
    `🥩 ${week.totalMacros.proteinG} г  ·  ` +
    `🧈 ${week.totalMacros.fatG} г  ·  ` +
    `🍞 ${week.totalMacros.carbsG} г\n\n`;

  if (extended) {
    const targetDelta = week.avgCaloriesPerDay - target;
    const sign = targetDelta > 0 ? "+" : "";
    const bestDays = week.days.filter((d) => d.mealCount > 0 && d.totalCalories <= target).length;
    text +=
      `⭐ **Pro-аналитика**\n` +
      `• Отклонение от цели: **${sign}${targetDelta}** ккал/день\n` +
      `• Дней в цели: **${bestDays}** / ${activeDays || 7}\n` +
      `• Рекомендация: ${targetDelta > 0 ? "снизить калорийность перекусов" : "добавить белок и сложные углеводы"}\n\n`;
  }

  text += `💡 _${escapeMd(week.insight)}_`;

  return text;
}

export function formatMonthStats(month: MonthStats, extended = false): string {
  const text = formatWeekStats(month, extended);
  return text.replace("📊 **Недельный отчёт**", "🗓 **Отчёт за 30 дней**");
}

export function formatAdminMetrics(metrics: AdminMetrics): string {
  return (
    "🛠 **Админка NutriBot**\n" +
    "━━━━━━━━━━━━━━\n" +
    `👥 Пользователей: **${metrics.totalUsers}**\n` +
    `🆓 Free: **${metrics.freeUsers}**\n` +
    `⭐ Premium: **${metrics.premiumUsers}**\n` +
    `📈 Conversion: **${metrics.conversionRate}%**\n` +
    `✅ Активных подписок: **${metrics.activeSubscriptions}**\n` +
    `💫 Доход Stars: **${metrics.totalStars}**\n` +
    `📸 AI scans сегодня: **${metrics.scansToday}**\n` +
    `💬 AI chat сегодня: **${metrics.aiMessagesToday}**\n` +
    `🧾 Платежей: **${metrics.paymentsCount}**\n` +
    `🍽 Записей еды: **${metrics.mealsCount}**\n` +
    `⚖️ Записей веса: **${metrics.weightsCount}**\n` +
    `🔗 Рефералов: **${metrics.referralsCount}**`
  );
}

export function formatReferralStats(stats: ReferralStats): string {
  let text =
    "🔗 **Реферальная программа**\n" +
    "━━━━━━━━━━━━━━\n" +
    `Ваша ссылка:\n\`${stats.referralCode}\`\n\n` +
    `Приглашено пользователей: **${stats.referralsCount}**\n`;

  if (stats.referredBy) {
    text += `\nВы пришли по приглашению пользователя **${stats.referredBy}**.`;
  }
  return text;
}

export function formatWeightHistory(
  history: import("../types/index.js").WeightHistory,
  targetKg?: number,
): string {
  if (history.entries.length === 0) {
    return (
      "⚖️ **Дневник веса**\n\n" +
      "Записей пока нет.\n\n" +
      "Отправьте: `/weight 72.5`"
    );
  }

  let text = "⚖️ **История веса**\n━━━━━━━━━━━━━━\n";

  if (history.latest) {
    text += `\n📍 Текущий: **${history.latest.weightKg}** кг\n`;
  }
  if (history.changeKg != null && history.entries.length > 1) {
    const sign = history.changeKg > 0 ? "+" : "";
    const emoji = history.changeKg < 0 ? "📉" : history.changeKg > 0 ? "📈" : "➡️";
    text += `${emoji} Изменение: **${sign}${history.changeKg}** кг\n`;
  }
  if (targetKg != null && history.latest) {
    const diff = Math.round((history.latest.weightKg - targetKg) * 10) / 10;
    const sign = diff > 0 ? "+" : "";
    text += `🎯 До цели (${targetKg} кг): **${sign}${diff}** кг\n`;
  }

  text += "\n**Последние записи:**\n";
  for (const e of [...history.entries].reverse().slice(0, 7)) {
    text += `• ${formatDateRu(e.createdAt.slice(0, 10))} — **${e.weightKg}** кг\n`;
  }

  return text;
}

export function formatWeightLogged(weight: number, history: import("../types/index.js").WeightHistory, targetKg?: number): string {
  let text = `✅ **Вес записан:** ${weight} кг\n`;
  if (history.changeKg != null && history.entries.length > 1) {
    const sign = history.changeKg > 0 ? "+" : "";
    text += `📊 За период: ${sign}${history.changeKg} кг\n`;
  }
  if (targetKg != null) {
    const diff = Math.round((weight - targetKg) * 10) / 10;
    const sign = diff > 0 ? "+" : "";
    text += `🎯 До цели (${targetKg} кг): ${sign}${diff} кг`;
  }
  return text;
}

export function formatNotifyToggle(enabled: boolean): string {
  return enabled
    ? "🔔 **Еженедельные отчёты включены**\n\nКаждое воскресенье в 10:00 (МСК) пришлю сводку за неделю."
    : "🔕 **Еженедельные отчёты отключены**\n\nВключить снова: /notify";
}

export const GOAL_PROMPT =
  "🎯 **Выберите цель** или укажите свой лимит:\n\n`/goal 2000` — ккал в день";

export const PHOTO_PROMPT = "📷 **Отправьте фото еды**\n\nЯ распознаю блюдо, посчитаю калории и БЖУ и сохраню в дневник.";

export const ANALYZING_TEXT = "🔍 _Анализирую блюдо…_";

function progressBar(percent: number): string {
  const filled = Math.round(Math.min(100, percent) / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function escapeMd(text: string): string {
  return text.replace(/([_*`[\]])/g, "\\$1");
}
