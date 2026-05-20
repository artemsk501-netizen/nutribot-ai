import cron from "node-cron";
import type { Bot } from "grammy";
import { waterReminderKeyboard } from "../bot/handlers/water.js";
import { getUserLocale, tSync } from "../i18n/index.js";
import { config } from "../config.js";
import { getStore } from "../services/store.js";
import { todayISO } from "../utils/date.js";

let scheduled = false;

export function startWaterReminderJob(bot: Bot): void {
  if (scheduled) return;
  scheduled = true;

  cron.schedule(
    "0 */30 * * * *",
    () => {
      void sendWaterReminders(bot).catch((err) => console.error("Water reminders failed:", err));
    },
    { timezone: config.WEEKLY_REPORT_TZ },
  );
  console.log(`Water reminders: every 30 min (${config.WEEKLY_REPORT_TZ})`);
}

async function sendWaterReminders(bot: Bot): Promise<void> {
  const store = getStore();
  const nowIso = new Date().toISOString();
  const userIds = await store.getUsersDueWaterReminder(nowIso);

  for (const userId of userIds) {
    try {
      const locale = await getUserLocale(userId);
      const stats = await store.getWaterDayStats(userId, todayISO());
      const pct = stats.goalMl > 0 ? Math.min(100, Math.round((stats.totalMl / stats.goalMl) * 100)) : 0;
      await bot.api.sendMessage(
        userId,
        tSync(locale, "water_reminder", {
          today: stats.totalMl,
          goal: stats.goalMl,
          pct,
        }),
        { parse_mode: "Markdown", reply_markup: waterReminderKeyboard(locale) },
      );
      await store.markWaterReminderSent(userId, nowIso);
      await sleep(50);
    } catch (err) {
      const code = (err as { error_code?: number })?.error_code;
      if (code === 403) {
        await store.setWaterSettings(userId, { remindersEnabled: false });
      }
      console.warn(`Water reminder skip user ${userId}:`, err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
