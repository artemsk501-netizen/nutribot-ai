export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface Micronutrients {
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  vitaminCMg?: number;
  ironMg?: number;
  calciumMg?: number;
}

export interface MealEntry {
  id: string;
  dishName: string;
  calories: number;
  macros: Macros;
  micronutrients?: Micronutrients;
  createdAt: string;
}

export interface DayStats {
  date: string;
  meals: MealEntry[];
  totalCalories: number;
  totalMacros: Macros;
  totalMicronutrients?: Micronutrients;
  goal?: { dailyCalories: number; type: string };
  remainingCalories: number;
}

export interface WeekDaySummary {
  date: string;
  totalCalories: number;
  mealCount: number;
}

export interface WeekStats {
  weekStart: string;
  weekEnd: string;
  days: WeekDaySummary[];
  totalCalories: number;
  avgCaloriesPerDay: number;
  totalMacros: Macros;
  goal?: { dailyCalories: number; type: string };
  insight: string;
}

export interface DayStatsResponse {
  stats: DayStats;
  profile: { premium: boolean; premiumPlan?: "basic" | "pro" | "ultra"; onboardingComplete: boolean; goal?: DayStats["goal"] } | null;
}

export interface WeekStatsResponse {
  week: WeekStats;
  profile: { premium: boolean; premiumPlan?: "basic" | "pro" | "ultra"; goal?: DayStats["goal"] } | null;
}

export interface MonthStatsResponse {
  month: WeekStats;
  profile: { premium: boolean; premiumPlan?: "basic" | "pro" | "ultra"; goal?: DayStats["goal"] } | null;
}

export interface ProfileResponse {
  profile: {
    telegramId: number;
    firstName?: string;
    goal?: DayStats["goal"];
    premium: boolean;
    premiumPlan?: "basic" | "pro" | "ultra";
    premiumExpiresAt?: string;
    weeklyReportsEnabled: boolean;
    dailyRemindersEnabled: boolean;
  } | null;
  plans: Record<string, { title: string; stars: number; description: string }>;
}

export interface WeightEntry {
  id: string;
  weightKg: number;
  createdAt: string;
}

export interface WeightResponse {
  history: {
    entries: WeightEntry[];
    latest?: WeightEntry;
    changeKg?: number;
  };
  targetWeightKg?: number;
}

export interface RecipesResponse {
  recipes: string[];
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { user?: { first_name?: string } };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          onClick: (cb: () => void) => void;
        };
      };
    };
  }
}

export function apiFetch(path: string): Promise<Response> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return fetch(path, {
    headers: { "X-Telegram-Init-Data": initData },
  });
}

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function progressBar(percent: number): string {
  const filled = Math.round(Math.min(100, percent) / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

export function renderMicronutrientsHtml(micro: Micronutrients, title = "Микронутриенты"): string {
  const rows: string[] = [];
  if (micro.fiberG != null) rows.push(`<div><span>Клетчатка</span><strong>${micro.fiberG}г</strong></div>`);
  if (micro.sugarG != null) rows.push(`<div><span>Сахар</span><strong>${micro.sugarG}г</strong></div>`);
  if (micro.sodiumMg != null) rows.push(`<div><span>Натрий</span><strong>${micro.sodiumMg} мг</strong></div>`);
  if (micro.potassiumMg != null) rows.push(`<div><span>Калий</span><strong>${micro.potassiumMg} мг</strong></div>`);
  if (micro.vitaminCMg != null) rows.push(`<div><span>Вит. C</span><strong>${micro.vitaminCMg} мг</strong></div>`);
  if (micro.ironMg != null) rows.push(`<div><span>Железо</span><strong>${micro.ironMg} мг</strong></div>`);
  if (micro.calciumMg != null) rows.push(`<div><span>Кальций</span><strong>${micro.calciumMg} мг</strong></div>`);
  if (rows.length === 0) return "";
  return `
    <section class="card micros">
      <h2>🔬 ${escapeHtml(title)}</h2>
      <div class="macro-grid micro-grid">${rows.join("")}</div>
    </section>`;
}
