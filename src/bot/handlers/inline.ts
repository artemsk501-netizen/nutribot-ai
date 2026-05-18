import type { Bot } from "grammy";
import { analyzeFoodFromText } from "../../services/foodAnalysis.js";

export function registerInline(bot: Bot): void {
  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();

    if (!query) {
      await ctx.answerInlineQuery([], {
        cache_time: 0,
        is_personal: true,
      });
      return;
    }

    const result = await analyzeFoodFromText(query);
    const id = `food-${Date.now()}`;

    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id,
          title: `${result.dishName} — ~${result.calories} ккал`,
          description: `Б ${result.macros.proteinG}г · Ж ${result.macros.fatG}г · У ${result.macros.carbsG}г`,
          input_message_content: {
            message_text:
              `🍽 **${result.dishName}**\n` +
              `🔥 ~${result.calories} ккал | БЖУ: ${result.macros.proteinG}/${result.macros.fatG}/${result.macros.carbsG}г\n\n` +
              `💡 ${result.advice}\n\n` +
              `_Рассчитано в @nutribot_ai_`,
            parse_mode: "Markdown",
          },
        },
      ],
      { cache_time: 300, is_personal: false },
    );
  });
}
