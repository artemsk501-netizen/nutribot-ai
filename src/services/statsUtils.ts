import type { DayStats, MealEntry, Macros, Micronutrients, UserGoal, WeekStats } from "../types/index.js";

export function sumMacros(meals: MealEntry[]): Macros {
  return meals.reduce(
    (acc, m) => ({
      proteinG: round1(acc.proteinG + m.macros.proteinG),
      fatG: round1(acc.fatG + m.macros.fatG),
      carbsG: round1(acc.carbsG + m.macros.carbsG),
    }),
    { proteinG: 0, fatG: 0, carbsG: 0 },
  );
}

export function sumMicronutrients(meals: MealEntry[]): Micronutrients | undefined {
  const withMicro = meals.filter((m) => m.micronutrients);
  if (withMicro.length === 0) return undefined;

  const sum: Micronutrients = {};
  for (const meal of withMicro) {
    const micro = meal.micronutrients!;
    if (micro.fiberG != null) sum.fiberG = round1((sum.fiberG ?? 0) + micro.fiberG);
    if (micro.sugarG != null) sum.sugarG = round1((sum.sugarG ?? 0) + micro.sugarG);
    if (micro.sodiumMg != null) sum.sodiumMg = round1((sum.sodiumMg ?? 0) + micro.sodiumMg);
    if (micro.potassiumMg != null) sum.potassiumMg = round1((sum.potassiumMg ?? 0) + micro.potassiumMg);
    if (micro.vitaminCMg != null) sum.vitaminCMg = round1((sum.vitaminCMg ?? 0) + micro.vitaminCMg);
    if (micro.ironMg != null) sum.ironMg = round1((sum.ironMg ?? 0) + micro.ironMg);
    if (micro.calciumMg != null) sum.calciumMg = round1((sum.calciumMg ?? 0) + micro.calciumMg);
  }
  return sum;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildWeekStats(
  meals: MealEntry[],
  weekStart: string,
  weekEnd: string,
  goal?: UserGoal,
): WeekStats {
  const days: WeekStats["days"] = [];
  let cursor = weekStart;

  while (cursor <= weekEnd) {
    const dayMeals = meals.filter((m) => m.createdAt.startsWith(cursor));
    days.push({
      date: cursor,
      totalCalories: dayMeals.reduce((s, m) => s + m.calories, 0),
      mealCount: dayMeals.length,
    });
    cursor = shiftDate(cursor, 1);
  }

  const totalCalories = days.reduce((s, d) => s + d.totalCalories, 0);
  const daysWithData = days.filter((d) => d.mealCount > 0).length || 1;

  return {
    weekStart,
    weekEnd,
    days,
    totalCalories,
    avgCaloriesPerDay: Math.round(totalCalories / daysWithData),
    totalMacros: sumMacros(meals),
    goal,
    insight: generateWeekInsight(days, goal),
  };
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateWeekInsight(
  days: WeekStats["days"],
  goal?: UserGoal,
): string {
  const target = goal?.dailyCalories ?? 2000;
  const activeDays = days.filter((d) => d.mealCount > 0);
  if (activeDays.length === 0) {
    return "На этой неделе нет записей. Отправляйте фото еды боту — так проще держать цель.";
  }

  const overDays = activeDays.filter((d) => d.totalCalories > target).length;
  const avg =
    activeDays.reduce((s, d) => s + d.totalCalories, 0) / activeDays.length;

  if (goal?.type === "lose") {
    if (overDays === 0) {
      return "Отличная неделя: все дни с записями укладываются в цель. Добавьте белок на ужин для сытости.";
    }
    return `В среднем ${Math.round(avg)} ккал/день. Сократите перекусы в ${overDays} днях, где был перебор.`;
  }

  if (goal?.type === "gain") {
    if (avg < target * 0.9) {
      return "Калорий немного не хватает для набора. Добавьте перекус: орехи, творог или смузи.";
    }
    return "Хороший темп набора. Следите за белком — не менее 1.6 г на кг веса.";
  }

  return `Среднее за неделю: ${Math.round(avg)} ккал. Старайтесь держаться около ${target} ккал.`;
}

export function buildDayStats(
  meals: MealEntry[],
  date: string,
  goal?: UserGoal,
  includeMicronutrients = false,
): DayStats {
  const totalMacros = sumMacros(meals);
  const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
  const dailyTarget = goal?.dailyCalories ?? 2000;

  return {
    date,
    meals,
    totalCalories,
    totalMacros,
    totalMicronutrients: includeMicronutrients ? sumMicronutrients(meals) : undefined,
    goal,
    remainingCalories: Math.max(0, dailyTarget - totalCalories),
  };
}

/** Понедельник недели для даты (UTC) */
export function weekStartForDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
