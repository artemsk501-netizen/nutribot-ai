import cron from "node-cron";
import type { Bot } from "grammy";
import { config } from "../config.js";
import { statsKeyboard } from "../bot/keyboards.js";
import { getStore } from "../services/store.js";
import { todayISO } from "../utils/date.js";

let scheduled = false;

export function startNotificationJobs(bot: Bot): void {
  if (!config.DAILY_REMINDERS_ENABLED) {
    console.log("Daily reminders: disabled");
    return;
  }
  if (scheduled) return;
  scheduled = true;

  cron.schedule(
    config.DAILY_REMINDER_CRON,
    () => {
      void sendDailyReminders(bot).catch((err) => console.error("Daily reminders failed:", err));
    },
    { timezone: config.WEEKLY_REPORT_TZ },
  );
  console.log(`Daily reminders: cron "${config.DAILY_REMINDER_CRON}" (${config.WEEKLY_REPORT_TZ})`);
}

async function sendDailyReminders(bot: Bot): Promise<void> {
  const store = getStore();
  const date = todayISO();
  const userIds = await store.getUsersDueDailyReminder(date);

  for (const userId of userIds) {
    try {
      const stats = await store.getDayStats(userId, date);
      const target = stats.goal?.dailyCalories ?? 2000;
      const pct = Math.min(100, Math.round((stats.totalCalories / target) * 100));
      const text =
        `🔔 **Ежедневное напоминание**\n\n` +
        `Сегодня: **${stats.totalCalories} / ${target}** ккал (${pct}%).\n` +
        (stats.meals.length === 0
          ? "Отправьте фото еды, чтобы заполнить дневник."
          : "Откройте статистику и проверьте, как идёте к цели.");

      await bot.api.sendMessage(userId, text, {
        parse_mode: "Markdown",
        reply_markup: statsKeyboard(),
      });
      await store.markDailyReminderSent(userId);
      await sleep(50);
    } catch (err) {
      const code = (err as { error_code?: number })?.error_code;
      if (code === 403) {
        await store.upsertUser({ telegramId: userId, dailyRemindersEnabled: false });
      }
      console.warn(`Daily reminder skip user ${userId}:`, err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
