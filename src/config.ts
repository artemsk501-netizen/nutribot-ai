import "dotenv/config";
import { z } from "zod";

const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined))
  .pipe(z.string().url().optional());

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN обязателен"),
  BOT_USERNAME: z.string().default("nutribot_ai"),
  WEBHOOK_URL: optionalUrl,
  PORT: z.coerce.number().default(3000),
  MINI_APP_URL: optionalUrl,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_CHAT_MODEL_FREE: z.string().default("gpt-4o-mini"),
  OPENAI_CHAT_MODEL_PREMIUM: z.string().default("gpt-4o"),
  OPENAI_MAX_IMAGE_MB: z.coerce.number().default(8),
  /** Только для локальной разработки без ключа OpenAI */
  OPENAI_ALLOW_MOCK: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  USDA_API_KEY: optionalString,
  SENTRY_DSN: optionalString,
  DATABASE_URL: optionalUrl,
  SQLITE_PATH: z.string().default("./data/nutribot.db"),
  WEBHOOK_SECRET: optionalString,
  ADMIN_IDS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((id) => Number(id.trim()))
            .filter((id) => Number.isFinite(id))
        : [],
    ),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_MESSAGES: z.coerce.number().default(25),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  WEEKLY_REPORTS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  WEEKLY_REPORT_CRON: z.string().default("0 10 * * 0"),
  WEEKLY_REPORT_TZ: z.string().default("Europe/Moscow"),
  WEEKLY_REPORT_RUN_ON_START: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  DAILY_REMINDERS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  DAILY_REMINDER_CRON: z.string().default("0 20 * * *"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Ошибка конфигурации:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  miniAppUrl: env.MINI_APP_URL ?? (env.WEBHOOK_URL ? `${env.WEBHOOK_URL.replace(/\/$/, "")}/miniapp/` : ""),
  isProduction: env.NODE_ENV === "production",
};
