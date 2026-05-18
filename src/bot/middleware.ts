import type { Bot, Context } from "grammy";
import { config } from "../config.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<number, Bucket>();

export function registerMiddleware(bot: Bot): void {
  bot.use(async (ctx, next) => {
    const start = Date.now();
    try {
      if (isRateLimited(ctx)) {
        await ctx.reply("⏳ Слишком много запросов. Попробуйте через минуту.");
        return;
      }

      await next();
    } catch (err) {
      console.error("Bot update failed:", {
        updateId: ctx.update.update_id,
        userId: ctx.from?.id,
        message: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply("⚠️ Ошибка обработки. Попробуйте ещё раз чуть позже.").catch(() => undefined);
    } finally {
      const ms = Date.now() - start;
      if (ms > 1500) {
        console.log("Slow update:", { updateId: ctx.update.update_id, userId: ctx.from?.id, ms });
      }
    }
  });
}

export function isAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id;
  return Boolean(userId && config.ADMIN_IDS.includes(userId));
}

function isRateLimited(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId || config.ADMIN_IDS.includes(userId)) return false;

  const now = Date.now();
  const current = buckets.get(userId);
  if (!current || current.resetAt <= now) {
    buckets.set(userId, { count: 1, resetAt: now + config.RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > config.RATE_LIMIT_MAX_MESSAGES;
}
