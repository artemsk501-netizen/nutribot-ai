import type { Locale, UserProfile } from "../types/index.js";
import { getStore } from "../services/store.js";
import { en } from "./en.js";
import { it } from "./it.js";
import type { TranslationKey } from "./keys.js";
import { ru } from "./ru.js";

const LOCALES: Record<Locale, Record<TranslationKey, string>> = { ru, en, it };

export function resolveLocale(
  profile?: Pick<UserProfile, "locale" | "languageCode"> | null,
  telegramLanguageCode?: string,
): Locale {
  if (profile?.locale && profile.locale in LOCALES) return profile.locale;
  const code = (telegramLanguageCode ?? profile?.languageCode ?? "").toLowerCase();
  if (code.startsWith("ru")) return "ru";
  if (code.startsWith("it")) return "it";
  return "en";
}

export function tSync(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let text = LOCALES[locale][key] ?? LOCALES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export async function t(
  userId: number,
  key: TranslationKey,
  params?: Record<string, string | number>,
  telegramLanguageCode?: string,
): Promise<string> {
  const user = await getStore().getUser(userId);
  const locale = resolveLocale(user, telegramLanguageCode);
  return tSync(locale, key, params);
}

export async function getUserLocale(
  userId: number,
  telegramLanguageCode?: string,
): Promise<Locale> {
  const user = await getStore().getUser(userId);
  return resolveLocale(user, telegramLanguageCode);
}

export { type TranslationKey } from "./keys.js";
