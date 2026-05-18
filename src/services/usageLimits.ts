import type { SubscriptionPlan, UsageKind, UsageStatus, UserProfile } from "../types/index.js";
import { isPremiumActive } from "./premium.js";

export const FREE_DAILY_PHOTO_LIMIT = 3;
export const FREE_DAILY_AI_MESSAGE_LIMIT = 3;

export const LIMIT_REACHED_MESSAGE =
  "⭐ Вы исчерпали бесплатный лимит на сегодня.\n" +
  "Бесплатный план: 3 анализа еды и 3 AI вопроса в день.\n" +
  "Оформите Premium для безлимитного доступа.";

export function getSubscriptionPlan(user?: UserProfile): SubscriptionPlan {
  return isPremiumActive(user) ? "premium" : "free";
}

export function getFreeLimit(kind: UsageKind): number {
  return kind === "photo_scan" ? FREE_DAILY_PHOTO_LIMIT : FREE_DAILY_AI_MESSAGE_LIMIT;
}

export function formatUsageCounter(status: UsageStatus): string {
  if (status.limit == null) {
    return status.kind === "photo_scan"
      ? "📸 Анализы еды: безлимит"
      : "💬 AI сообщения: безлимит";
  }

  const usedAfterAction = Math.min(status.used, status.limit);
  const remaining = Math.max(0, status.limit - usedAfterAction);
  return status.kind === "photo_scan"
    ? `📸 Анализов осталось сегодня: ${remaining}/${status.limit}`
    : `💬 AI сообщений осталось: ${remaining}/${status.limit}`;
}
