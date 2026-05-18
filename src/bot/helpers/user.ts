import type { Context } from "grammy";
import { getStore } from "../../services/store.js";
import type { UserProfile } from "../../types/index.js";

/** Регистрирует пользователя в БД при любом взаимодействии. */
export async function ensureUser(ctx: Context): Promise<UserProfile | undefined> {
  const from = ctx.from;
  if (!from?.id) return undefined;

  return getStore().upsertUser({
    telegramId: from.id,
    firstName: from.first_name,
    languageCode: from.language_code,
  });
}
