import cron from "node-cron";
import type { Bot } from "grammy";
import { config } from "../config.js";
import { statsKeyboard } from "../bot/keyboards.js";
import { formatWeekStats } from "../bot/messages.js";
import { formatRecipeBlock } from "../services/recipes.js";
import { hasPremiumFeature } from "../services/premium.js";
import { getStore } from "../services/store.js";
import { weekStartForDate } from "../services/statsUtils.js";

let scheduled = false;

export function startWeeklyReportJob(bot: Bot): void {
  if (!config.WEEKLY_REPORTS_ENABLED) {
    console.log("Weekly reports: disabled");
    return;
  }

  if (scheduled) return;
  scheduled = true;

  const run = () => {
    void sendWeeklyReports(bot).catch((err) => {
      console.error("Weekly report job failed:", err);
    });
  };

  cron.schedule(config.WEEKLY_REPORT_CRON, run, { timezone: config.WEEKLY_REPORT_TZ });
  console.log(`Weekly reports: cron "${config.WEEKLY_REPORT_CRON}" (${config.WEEKLY_REPORT_TZ})`);

  if (config.WEEKLY_REPORT_RUN_ON_START) {
    setTimeout(run, 5000);
  }
}

async function sendWeeklyReports(bot: Bot): Promise<void> {
  const store = getStore();
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartForDate(today);
  const userIds = await store.getUsersDueWeeklyReport(weekStart);

  if (userIds.length === 0) {
    console.log("Weekly reports: no users due");
    return;
  }

  console.log(`Weekly reports: sending to ${userIds.length} users`);
  let sent = 0;

  for (const userId of userIds) {
    try {
      const end = shiftDate(weekStart, 6);
      const week = await store.getWeekStats(userId, end);
      if (week.days.every((d) => d.mealCount === 0)) continue;

      const user = await store.getUser(userId);
      if (!hasPremiumFeature(user, "weeklyReports")) continue;
      const recipes = hasPremiumFeature(user, "mealPlans") ? formatRecipeBlock(user?.goal, week) : "";
      const weightHistory = await store.getWeightHistory(userId, 7);
      let weightLine = "";
      if (weightHistory.latest) {
        weightLine = `\n\n⚖️ Текущий вес: **${weightHistory.latest.weightKg}** кг`;
        if (weightHistory.changeKg != null) {
          const sign = weightHistory.changeKg > 0 ? "+" : "";
          weightLine += ` (${sign}${weightHistory.changeKg} кг за неделю)`;
        }
      }

      const text =
        `📬 **Еженедельный отчёт NutriBot**\n\n${formatWeekStats(week, hasPremiumFeature(user, "weeklyReports"))}${weightLine}${recipes}\n\n` +
        `_Открыть дневник → кнопка ниже_`;

      await bot.api.sendMessage(userId, text, {
        parse_mode: "Markdown",
        reply_markup: statsKeyboard(),
      });

      await store.markWeeklyReportSent(userId);
      sent++;
      await sleep(50);
    } catch (err) {
      const code = (err as { error_code?: number })?.error_code;
      if (code === 403) {
        await store.setWeeklyReportsEnabled(userId, false);
      }
      console.warn(`Weekly report skip user ${userId}:`, err);
    }
  }

  console.log(`Weekly reports: sent ${sent}/${userIds.length}`);
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
