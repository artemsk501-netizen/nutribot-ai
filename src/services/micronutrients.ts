import type { FoodAnalysisResult, Micronutrients } from "../types/index.js";

const PREMIUM_MICRO_PROMPT = `
Дополнительно оцени микронутриенты на порцию (Premium). Добавь в JSON поле "micronutrients":
{"fiberG":number,"sugarG":number,"sodiumMg":number,"potassiumMg":number,"vitaminCMg":number,"ironMg":number,"calciumMg":number}`;

export function premiumAnalysisPromptAddon(): string {
  return PREMIUM_MICRO_PROMPT;
}

export function mockMicronutrients(): Micronutrients {
  return {
    fiberG: 4,
    sugarG: 8,
    sodiumMg: 320,
    potassiumMg: 280,
    vitaminCMg: 12,
    ironMg: 2.1,
    calciumMg: 45,
  };
}

export function mergeMicronutrients(result: FoodAnalysisResult, premium: boolean): FoodAnalysisResult {
  if (!premium) return result;
  if (!result.micronutrients) {
    result.micronutrients = mockMicronutrients();
  }
  return result;
}

export function formatMicronutrients(micro: Micronutrients): string {
  const lines: string[] = ["\n🔬 **Микронутриенты (Premium):**"];
  if (micro.fiberG != null) lines.push(`🌾 Клетчатка: ${micro.fiberG}г`);
  if (micro.sugarG != null) lines.push(`🍬 Сахар: ${micro.sugarG}г`);
  if (micro.sodiumMg != null) lines.push(`🧂 Натрий: ${micro.sodiumMg} мг`);
  if (micro.potassiumMg != null) lines.push(`⚡ Калий: ${micro.potassiumMg} мг`);
  if (micro.vitaminCMg != null) lines.push(`🍊 Витамин C: ${micro.vitaminCMg} мг`);
  if (micro.ironMg != null) lines.push(`🩸 Железо: ${micro.ironMg} мг`);
  if (micro.calciumMg != null) lines.push(`🦴 Кальций: ${micro.calciumMg} мг`);
  return lines.join("\n");
}

export function formatMicronutrientsBrief(micro: Micronutrients): string {
  const parts: string[] = [];
  if (micro.fiberG != null) parts.push(`клетч. ${micro.fiberG}г`);
  if (micro.sodiumMg != null) parts.push(`Na ${micro.sodiumMg}мг`);
  if (micro.ironMg != null) parts.push(`Fe ${micro.ironMg}мг`);
  return parts.length ? ` · ${parts.join(", ")}` : "";
}
