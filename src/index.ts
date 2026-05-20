import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { closePool } from "./db/pool.js";
import { closeSqlite } from "./db/sqlite/connection.js";
import { createBot, configureBot } from "./bot/setup.js";
import { createApp, startServer } from "./api/server.js";
import { initStore } from "./services/store.js";
import { captureError, initObservability } from "./services/observability.js";
import { startWeeklyReportJob } from "./jobs/weeklyReport.js";
import { startNotificationJobs } from "./jobs/notifications.js";
import { startWaterReminderJob } from "./jobs/waterReminders.js";

async function main(): Promise<void> {
  initObservability();
  console.log(`NutriBot starting (${config.NODE_ENV})`);
  await runMigrations();
  await initStore();
  console.log(`Config: port=${config.PORT}, sqlite=${config.SQLITE_PATH}, webhook=${config.WEBHOOK_URL ? "enabled" : "disabled"}`);

  if (!config.OPENAI_API_KEY) {
    console.warn(
      "⚠️ OPENAI_API_KEY не задан — анализ фото недоступен. Добавьте ключ в .env (platform.openai.com).",
    );
  } else {
    console.log(`OpenAI Vision: ${config.OPENAI_MODEL}`);
  }

  const bot = createBot();
  await configureBot(bot);

  const app = createApp(bot, Boolean(config.WEBHOOK_URL));

  let usePolling = false;

  if (config.WEBHOOK_URL) {
    const webhookPath = config.WEBHOOK_SECRET
      ? `/webhook/${config.WEBHOOK_SECRET}`
      : "/webhook";
    const url = `${config.WEBHOOK_URL.replace(/\/$/, "")}${webhookPath}`;

    try {
      await bot.api.setWebhook(url, {
        allowed_updates: [
          "message",
          "callback_query",
          "inline_query",
          "pre_checkout_query",
        ],
      });
      console.log(`Webhook: ${url}`);
    } catch (err) {
      captureError(err);
      console.error("Webhook setup failed:", err);
    }
  } else {
    usePolling = true;
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch((err) => {
      captureError(err);
      console.warn("deleteWebhook skipped (Telegram API unavailable)");
      console.warn(err instanceof Error ? err.message : err);
    });
    console.warn("WEBHOOK_URL не задан — long polling (только для локальной разработки)");
    void bot.start({
      allowed_updates: [
        "message",
        "callback_query",
        "inline_query",
        "pre_checkout_query",
      ],
    }).catch((err) => {
      captureError(err);
      console.error("Long polling failed:", err);
    });
  }

  const server = await startServer(app);
  startWeeklyReportJob(bot);
  startNotificationJobs(bot);
  startWaterReminderJob(bot);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Shutdown: received ${signal}`);
    try {
      if (usePolling) await bot.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closePool();
      closeSqlite();
      console.log("Shutdown: complete");
      process.exit(0);
    } catch (err) {
      captureError(err);
      console.error("Shutdown error:", err);
      process.exit(1);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  captureError(err);
  console.error(err);
  process.exit(1);
});
