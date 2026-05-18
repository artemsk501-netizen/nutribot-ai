import type { Context } from "grammy";
import type { Bot } from "grammy";
import { randomUUID } from "node:crypto";
import type { PremiumPlan } from "../../types/index.js";
import { config } from "../../config.js";
import {
  PREMIUM_PLANS,
  TEST_PREMIUM_PAYLOAD,
  isTestPremiumPayload,
  premiumExpiresAtFromNow,
  premiumPayload,
  premiumPlanFromPayload,
  testPremiumExpiresAtFromNow,
} from "../../services/premium.js";
import { getStore } from "../../services/store.js";

export function formatPremiumMenu(): string {
  const testLine = config.testPaymentsEnabled
    ? "\n🧪 **TEST PREMIUM** · 1 Star / 1 день доступен только в test mode.\n"
    : "";
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
    testLine +
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

export async function sendTestPremiumInvoice(ctx: Context): Promise<void> {
  if (!config.testPaymentsEnabled) {
    await ctx.reply("⛔ Test payments доступны только в development или при TEST_PAYMENTS=true.");
    return;
  }
  if (!ctx.from?.id || !ctx.chat) return;

  await ctx.api.sendInvoice(
    ctx.chat.id,
    "TEST PREMIUM NutriBot (1 день)",
    "Test payment mode: Premium на 1 день за 1 Star.",
    TEST_PREMIUM_PAYLOAD,
    "XTR",
    [{ label: "TEST PREMIUM 1 день", amount: 1 }],
    { provider_token: "" },
  );
}

export function registerPayments(bot: Bot): void {
  bot.callbackQuery(/^premium:buy:(basic|pro|ultra)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendPremiumInvoice(ctx, ctx.match![1] as PremiumPlan);
  });

  bot.callbackQuery("premium:buy:test", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendTestPremiumInvoice(ctx);
  });

  bot.on("pre_checkout_query", async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    const plan = premiumPlanFromPayload(payload);
    const testPayment = config.testPaymentsEnabled && isTestPremiumPayload(payload);
    await ctx.answerPreCheckoutQuery(
      Boolean(plan || testPayment),
      plan || testPayment ? undefined : "Неизвестный тариф Premium",
    );
  });

  bot.on("message:successful_payment", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const payload = ctx.message.successful_payment.invoice_payload;
    const testPayment = config.testPaymentsEnabled && isTestPremiumPayload(payload);
    const plan = testPayment ? "basic" : premiumPlanFromPayload(payload);
    if (!plan) {
      await ctx.reply("⚠️ Оплата получена, но тариф не распознан. Напишите в поддержку.");
      return;
    }

    const expiresAt = testPayment ? testPremiumExpiresAtFromNow() : premiumExpiresAtFromNow();
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
      stars: testPayment ? 1 : tier.stars,
      currency: "XTR",
      createdAt: new Date().toISOString(),
    });
    if (testPayment) {
      await ctx.reply(
        `🧪 **TEST PREMIUM активирован на 1 день.**\n\n` +
          `⏳ Действует до: **${expiresAt.slice(0, 10)}**\n\n` +
          "Это тестовая оплата за 1 Star.",
        { parse_mode: "Markdown" },
      );
      return;
    }
    await ctx.reply(
      `⭐ **Спасибо! Premium ${tier.title} активирован на 30 дней.**\n\n` +
        `⏳ Действует до: **${expiresAt.slice(0, 10)}**\n\n` +
        `Теперь доступны функции тарифа **${tier.title}**.`,
      { parse_mode: "Markdown" },
    );
  });
}
