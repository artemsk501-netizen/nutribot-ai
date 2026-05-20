import { InlineKeyboard, Keyboard } from "grammy";
import { config } from "../config.js";
import { tSync } from "../i18n/index.js";
import type { Locale } from "../types/index.js";

export function languageKeyboard() {
  return new InlineKeyboard()
    .text("🇷🇺 Русский", "lang:ru")
    .row()
    .text("🇬🇧 English", "lang:en")
    .row()
    .text("🇮🇹 Italiano", "lang:it");
}

export function welcomeKeyboard(locale: Locale) {
  return new InlineKeyboard().text("▶️ Start", "onboarding:start");
}

export function goalTypeKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(`📉 ${tSync(locale, "goal_lose")}`, "goal:lose")
    .text(`📈 ${tSync(locale, "goal_gain")}`, "goal:gain")
    .row()
    .text(`⚖️ ${tSync(locale, "goal_maintain")}`, "goal:maintain");
}

export function onboardingGoalKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(`🔥 ${tSync(locale, "goal_lose")}`, "onboarding:goal:lose")
    .row()
    .text(`💪 ${tSync(locale, "goal_gain")}`, "onboarding:goal:gain")
    .row()
    .text(`⚖️ ${tSync(locale, "goal_maintain")}`, "onboarding:goal:maintain");
}

export function activityKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(`🪑 ${tSync(locale, "activity_low")}`, "onboarding:activity:low")
    .row()
    .text(`🚶 ${tSync(locale, "activity_medium")}`, "onboarding:activity:medium")
    .row()
    .text(`🏃 ${tSync(locale, "activity_high")}`, "onboarding:activity:high");
}

export function afterMealKeyboard(locale: Locale) {
  const kb = new InlineKeyboard();
  if (config.miniAppUrl) {
    kb.webApp(`📊 ${tSync(locale, "btn_stats")}`, config.miniAppUrl);
  }
  kb.row().text(tSync(locale, "btn_premium"), "premium:show");
  return kb;
}

export function mealPortionKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(tSync(locale, "portion_small"), "meal:portion:small")
    .text(tSync(locale, "portion_medium"), "meal:portion:medium")
    .row()
    .text(tSync(locale, "portion_large"), "meal:portion:large")
    .text(tSync(locale, "portion_grams"), "meal:portion:grams")
    .row()
    .text(tSync(locale, "btn_edit"), "meal:edit")
    .text(tSync(locale, "btn_discard"), "meal:discard");
}

export function mealConfirmationKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(tSync(locale, "btn_add"), "meal:add")
    .text(tSync(locale, "btn_edit"), "meal:edit")
    .row()
    .text(tSync(locale, "btn_discard"), "meal:discard");
}

export function statsKeyboard() {
  const kb = new InlineKeyboard();
  if (config.miniAppUrl) {
    kb.webApp("📊 Diary", config.miniAppUrl);
  }
  return kb;
}

export function premiumKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text(tSync(locale, "premium_basic"), "premium:buy:basic")
    .row()
    .text(tSync(locale, "premium_pro"), "premium:buy:pro")
    .row()
    .text(tSync(locale, "premium_ultra"), "premium:buy:ultra");
}

export function upgradeKeyboard(locale: Locale) {
  return new InlineKeyboard().text(tSync(locale, "btn_premium"), "premium:show");
}

export function replyMenu(locale: Locale) {
  return new Keyboard()
    .text(tSync(locale, "btn_photo"))
    .text(tSync(locale, "btn_stats"))
    .row()
    .text(tSync(locale, "btn_week"))
    .text(tSync(locale, "btn_goal"))
    .row()
    .text(tSync(locale, "btn_language"))
    .text(tSync(locale, "btn_help"))
    .resized();
}

export function waterMenuKeyboard(locale: Locale, enabled: boolean) {
  const kb = new InlineKeyboard();
  kb.text(enabled ? "❌ Disable" : "✅ Enable", enabled ? "water:disable" : "water:enable").row();
  kb.text("🎯 Goal", "water:goal").text("⏰ Interval", "water:interval").row();
  kb.text("🌙 Quiet hours", "water:quiet").row();
  kb.text("💧 +150ml", "water:log:150")
    .text("💧 +250ml", "water:log:250")
    .text("💧 +500ml", "water:log:500")
    .row();
  kb.text("✏️ Custom", "water:log:custom").text("📊 Stats", "water:stats");
  return kb;
}

export function waterReminderKeyboard(locale: Locale) {
  return new InlineKeyboard()
    .text("💧 Done", "water:reminder:done")
    .text("⏰ Later", "water:reminder:later")
    .row()
    .text("❌ Off", "water:reminder:off");
}
