import OpenAI from "openai";
import type { DayStats, UserProfile, WeightHistory } from "../types/index.js";
import { config } from "../config.js";
import { getSubscriptionPlan } from "./usageLimits.js";

export interface NutritionAssistantContext {
  user?: UserProfile;
  today?: DayStats;
  weightHistory?: WeightHistory;
}

const TOPICS =
  "nutrition, calories, weight loss, muscle gain, macros/BJU, healthy products, fitness, recovery, hydration, meal timing, healthy habits";

export function buildNutritionAssistantPrompt(context: NutritionAssistantContext): string {
  const user = context.user;
  const plan = getSubscriptionPlan(user);
  const premium = plan === "premium";
  const goal = user?.goal
    ? `${user.goal.type}, ${user.goal.dailyCalories} kcal/day`
    : "not set";
  const profile = [
    user?.currentWeightKg ? `current weight ${user.currentWeightKg} kg` : undefined,
    user?.targetWeightKg ? `target weight ${user.targetWeightKg} kg` : undefined,
    user?.heightCm ? `height ${user.heightCm} cm` : undefined,
    user?.age ? `age ${user.age}` : undefined,
    user?.activityLevel ? `activity ${user.activityLevel}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const today = context.today
    ? `${context.today.totalCalories}/${context.today.goal?.dailyCalories ?? user?.goal?.dailyCalories ?? "?"} kcal, P/F/C ${context.today.totalMacros.proteinG}/${context.today.totalMacros.fatG}/${context.today.totalMacros.carbsG}g, meals ${context.today.meals.length}`
    : "no meals today";
  const meals = context.today?.meals
    .slice(-4)
    .map((m) => `${m.dishName}: ${m.calories} kcal, P/F/C ${m.macros.proteinG}/${m.macros.fatG}/${m.macros.carbsG}g`)
    .join("; ");
  const weight = context.weightHistory?.latest
    ? `latest ${context.weightHistory.latest.weightKg} kg, change ${context.weightHistory.changeKg ?? 0} kg`
    : "no weight entries";

  return `You are a professional nutrition and fitness assistant.
Style: concise, modern, motivating, practical, Telegram-friendly, not too verbose.
Answer in Russian unless the user clearly asks another language.
Allowed topics: ${TOPICS}.
If the user asks outside these topics, briefly redirect to nutrition/fitness.
Do not diagnose diseases or prescribe treatment. For medical issues, suggest consulting a clinician.

Subscription: ${plan}.
${premium ? "Premium response: give more detailed coaching, meal ideas, deeper reasoning and practical steps when useful." : "Free response: keep it short, maximum about 300-500 characters. No meal plans, micronutrients, deep analysis or premium coaching."}

User memory:
- goal: ${goal}
- profile: ${profile || "not complete"}
- today: ${today}
- recent meals: ${meals || "none"}
- weight progress: ${weight}`;
}

export function mockAssistantReply(context: NutritionAssistantContext): string {
  const calories = context.today?.totalCalories ?? 0;
  const goal = context.today?.goal?.dailyCalories ?? context.user?.goal?.dailyCalories;
  const tail = goal ? ` Сейчас ${calories}/${goal} ккал за день.` : "";
  return `Демо-ответ AI: держите фокус на белке, овощах и стабильном режиме.${tail} Пришлите фото еды или вопрос по рациону.`;
}

export async function answerNutritionQuestion(
  question: string,
  context: NutritionAssistantContext,
): Promise<{ text: string; model: string }> {
  if (config.OPENAI_ALLOW_MOCK && !config.OPENAI_API_KEY) {
    return { text: mockAssistantReply(context), model: "mock" };
  }
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const premium = getSubscriptionPlan(context.user) === "premium";
  const model = premium ? config.OPENAI_CHAT_MODEL_PREMIUM : config.OPENAI_CHAT_MODEL_FREE;
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const maxTokens = premium ? 700 : 180;

  const response = await retryOpenAi(() =>
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildNutritionAssistantPrompt(context) },
        { role: "user", content: question.slice(0, premium ? 2000 : 700) },
      ],
      max_tokens: maxTokens,
      temperature: premium ? 0.55 : 0.35,
    }),
  );

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty OpenAI response");
  return { text, model };
}

async function retryOpenAi<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
