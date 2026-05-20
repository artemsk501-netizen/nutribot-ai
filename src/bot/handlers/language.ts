import type { Bot, Context } from "grammy";
import { getUserLocale, t, tSync } from "../../i18n/index.js";
import { getStore } from "../../services/store.js";
import type { Locale } from "../../types/index.js";
import { ensureUser } from "../helpers/user.js";
import { languageKeyboard, replyMenu } from "../keyboards.js";
import { startOrResumeOnboarding } from "./onboarding.js";

export function menuButtonTexts(key: Parameters<typeof tSync>[1]): string[] {
  return (["ru", "en", "it"] as Locale[]).map((l) => tSync(l, key));
}

export function registerLanguage(bot: Bot): void {
  bot.callbackQuery(/^lang:(ru|en|it)$/, async (ctx) => {
    const userId = ctx.from.id;
    const locale = ctx.match![1] as Locale;
    await getStore().upsertUser({ telegramId: userId, locale });
    await ctx.answerCallbackQuery({ text: await t(userId, "language_saved", undefined, ctx.from.language_code) });
    const user = await getStore().getUser(userId);
    if (user) {
      await ctx.editMessageText(tSync(locale, "language_saved")).catch(() => undefined);
      await startOrResumeOnboarding(ctx, user);
    }
  });
}

export async function promptLanguageIfNeeded(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const user = await ensureUser(ctx);
  if (user?.locale) return false;
  const locale = await getUserLocale(userId, ctx.from?.language_code);
  await ctx.reply(tSync(locale, "choose_language"), {
    parse_mode: "Markdown",
    reply_markup: languageKeyboard(),
  });
  return true;
}

export async function sendLanguageSettings(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  const locale = await getUserLocale(userId, ctx.from?.language_code);
  await ctx.reply(tSync(locale, "language_settings"), {
    parse_mode: "Markdown",
    reply_markup: languageKeyboard(),
  });
}
