import { Bot } from "grammy";
import { config } from "../config.js";
import { BOT_COMMANDS, registerCommands } from "./handlers/commands.js";
import { registerInline } from "./handlers/inline.js";
import { registerOnboarding } from "./handlers/onboarding.js";
import { registerPayments } from "./handlers/payments.js";
import { registerWeightCommands } from "./handlers/weight.js";
import { registerMiddleware } from "./middleware.js";

export function createBot(): Bot {
  const bot = new Bot(config.BOT_TOKEN);

  registerMiddleware(bot);
  registerOnboarding(bot);
  registerCommands(bot);
  registerWeightCommands(bot);
  registerInline(bot);
  registerPayments(bot);

  return bot;
}

export async function configureBot(bot: Bot): Promise<void> {
  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
    console.log("Telegram commands: configured");
  } catch (err) {
    console.warn("Telegram commands: skipped (Telegram API unavailable)");
    console.warn(err instanceof Error ? err.message : err);
  }

  if (config.miniAppUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: "web_app",
          text: "Дневник питания",
          web_app: { url: config.miniAppUrl },
        },
      });
      console.log("Telegram menu button: configured");
    } catch (err) {
      console.warn("Telegram menu button: skipped (Telegram API unavailable)");
      console.warn(err instanceof Error ? err.message : err);
    }
  }

  try {
    const me = await bot.api.getMe();
    console.log(`Бот @${me.username} готов`);
  } catch (err) {
    console.warn("Bot identity: unavailable during startup");
    console.warn(err instanceof Error ? err.message : err);
  }
}
