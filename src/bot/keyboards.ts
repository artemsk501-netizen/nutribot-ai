import { InlineKeyboard, Keyboard } from "grammy";
import { config } from "../config.js";

export function welcomeKeyboard() {
  return new InlineKeyboard().text("▶️ Старт", "onboarding:start");
}

export function goalTypeKeyboard() {
  return new InlineKeyboard()
    .text("📉 Похудеть", "goal:lose")
    .text("📈 Набрать", "goal:gain")
    .row()
    .text("⚖️ Поддержать", "goal:maintain");
}

export function onboardingGoalKeyboard() {
  return new InlineKeyboard()
    .text("🔥 Похудеть", "onboarding:goal:lose")
    .row()
    .text("💪 Набрать массу", "onboarding:goal:gain")
    .row()
    .text("⚖️ Поддерживать вес", "onboarding:goal:maintain");
}

export function activityKeyboard() {
  return new InlineKeyboard()
    .text("🪑 Низкая", "onboarding:activity:low")
    .row()
    .text("🚶 Средняя", "onboarding:activity:medium")
    .row()
    .text("🏃 Высокая", "onboarding:activity:high");
}

export function afterMealKeyboard() {
  const kb = new InlineKeyboard();
  if (config.miniAppUrl) {
    kb.webApp("📊 Статистика дня", config.miniAppUrl);
  }
  kb.row().text("⭐ Премиум", "premium:show");
  return kb;
}

export function statsKeyboard() {
  const kb = new InlineKeyboard();
  if (config.miniAppUrl) {
    kb.webApp("📊 Открыть дневник", config.miniAppUrl);
  }
  return kb;
}

export function premiumKeyboard() {
  const kb = new InlineKeyboard()
    .text("Basic · 100 ⭐", "premium:buy:basic")
    .row()
    .text("Pro · 300 ⭐", "premium:buy:pro")
    .row()
    .text("Ultra · 700 ⭐", "premium:buy:ultra");
  if (config.testPaymentsEnabled) {
    kb.row().text("TEST Premium · 1 ⭐", "premium:buy:test");
  }
  return kb;
}

export function upgradeKeyboard() {
  return new InlineKeyboard().text("⭐ Купить Premium", "premium:show");
}

export const replyMenu = new Keyboard()
  .text("📷 Фото еды")
  .text("📊 Статистика")
  .row()
  .text("📅 Неделя")
  .text("🎯 Цель")
  .row()
  .text("❓ Помощь")
  .resized();
