import type { Context } from "grammy";
import type { Bot } from "grammy";
import { randomUUID } from "node:crypto";
import type { PremiumPlan } from "../../types/index.js";
import {
  PREMIUM_PLANS,
  premiumExpiresAtFromNow,
  premiumPayload,
  premiumPlanFromPayload,
} from "../../services/premium.js";
import { getStore } from "../../services/store.js";

export function formatPremiumMenu(): string {
  return (
    "⭐ **NutriBot Premium**\n\n" +
    "**Basic · 100 Stars / 30 дней**\n" +
    "• Базовый premium-анализ еды\n\n" +
    "**Pro · 300 Stars / 30 дней**\n" +
    "• Микронутриенты\n" +
    "• AI-рекомендации нутрициолога\n" +
    "• Расширенные недельные отчёты\n" +
    "• Экспорт статистики\n\n" +
    "**Ultra · 700 Stars / 30 дней**\n" +
    "• Персональный AI-нутрициолог\n" +
    "• Планы питания\n" +
    "• PDF-экспорт\n" +
    "• Расширенная аналитика\n" +
    "\n" +
    "Выберите тариф:"
  );
}

export async function sendPremiumInvoice(ctx: Context, plan: PremiumPlan = "basic"): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !ctx.chat) return;
  const tier = PREMIUM_PLANS[plan];

  await ctx.api.sendInvoice(
    ctx.chat.id,
    `NutriBot Premium ${tier.title} (30 дней)`,
    tier.description,
    premiumPayload(plan),
    "XTR",
    [{ label: `${tier.title} 30 дней`, amount: tier.stars }],
    { provider_token: "" },
  );
}

export function registerPayments(bot: Bot): void {
  bot.callbackQuery(/^premium:buy:(basic|pro|ultra)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendPremiumInvoice(ctx, ctx.match![1] as PremiumPlan);
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    const plan = premiumPlanFromPayload(payload);
    await ctx.answerPreCheckoutQuery(
      Boolean(plan),
      plan ? undefined : "Неизвестный тариф Premium",
    );
  });

  bot.on("message:successful_payment", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const payload = ctx.message.successful_payment.invoice_payload;
    const plan = premiumPlanFromPayload(payload);
    if (!plan) {
      await ctx.reply("⚠️ Оплата получена, но тариф не распознан. Напишите в поддержку.");
      return;
    }

    const expiresAt = premiumExpiresAtFromNow();
    const tier = PREMIUM_PLANS[plan];

    const store = getStore();
    await store.upsertUser({
      telegramId: userId,
      subscriptionPlan: "premium",
      premium: true,
      premiumPlan: plan,
      premiumExpiresAt: expiresAt,
    });
    await store.recordPayment({
      id: randomUUID(),
      userId,
      telegramPaymentChargeId: ctx.message.successful_payment.telegram_payment_charge_id,
      providerPaymentChargeId: ctx.message.successful_payment.provider_payment_charge_id,
      payload,
      plan,
      stars: tier.stars,
      currency: "XTR",
      createdAt: new Date().toISOString(),
    });
    await ctx.reply(
      `⭐ **Спасибо! Premium ${tier.title} активирован на 30 дней.**\n\n` +
        `⏳ Действует до: **${expiresAt.slice(0, 10)}**\n\n` +
        `Теперь доступны функции тарифа **${tier.title}**.`,
      { parse_mode: "Markdown" },
    );
  });
}
