import type { PremiumFeature, PremiumPlan, UserProfile } from "../types/index.js";

const PREMIUM_DAYS = 30;
const TEST_PREMIUM_DAYS = 1;

export const TEST_PREMIUM_PAYLOAD = "premium_test";

export interface PremiumPlanConfig {
  plan: PremiumPlan;
  title: string;
  stars: number;
  description: string;
  features: PremiumFeature[];
}

export const PREMIUM_PLANS: Record<PremiumPlan, PremiumPlanConfig> = {
  basic: {
    plan: "basic",
    title: "Basic",
    stars: 100,
    description: "Базовый AI-анализ еды и premium-статус на 30 дней.",
    features: ["basicAnalysis"],
  },
  pro: {
    plan: "pro",
    title: "Pro",
    stars: 300,
    description: "Микронутриенты, AI-рекомендации и расширенные недельные отчёты.",
    features: ["basicAnalysis", "micronutrients", "aiRecommendations", "weeklyReports", "exportStats"],
  },
  ultra: {
    plan: "ultra",
    title: "Ultra",
    stars: 700,
    description: "Персональный AI-нутрициолог, планы питания, PDF-экспорт и аналитика.",
    features: [
      "basicAnalysis",
      "micronutrients",
      "aiRecommendations",
      "weeklyReports",
      "personalNutritionist",
      "mealPlans",
      "exportStats",
      "exportPdf",
      "advancedAnalytics",
    ],
  },
};

export function isPremiumActive(user?: UserProfile): boolean {
  if (!user?.premium) return false;
  if (!user.premiumExpiresAt) return true;
  return new Date(user.premiumExpiresAt).getTime() > Date.now();
}

export function applyPremiumStatus(user: UserProfile): UserProfile {
  if (!user.premium) return user;
  if (isPremiumActive(user)) return user;
  return {
    ...user,
    subscriptionPlan: "free",
    premium: false,
    premiumPlan: undefined,
    premiumExpiresAt: undefined,
  };
}

export function premiumExpiresAtFromNow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + PREMIUM_DAYS);
  return d.toISOString();
}

export function testPremiumExpiresAtFromNow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + TEST_PREMIUM_DAYS);
  return d.toISOString();
}

export function normalizePremiumPlan(plan: unknown): PremiumPlan | undefined {
  return plan === "basic" || plan === "pro" || plan === "ultra" ? plan : undefined;
}

export function getPremiumPlan(user?: UserProfile): PremiumPlan | undefined {
  if (!isPremiumActive(user)) return undefined;
  return normalizePremiumPlan(user?.premiumPlan) ?? (user?.premium ? "basic" : undefined);
}

export function hasPremiumFeature(user: UserProfile | undefined, feature: PremiumFeature): boolean {
  const plan = getPremiumPlan(user);
  if (!plan) return false;
  return PREMIUM_PLANS[plan].features.includes(feature);
}

export function premiumPlanLabel(plan?: PremiumPlan): string {
  return plan ? PREMIUM_PLANS[plan].title : "Free";
}

export function premiumPayload(plan: PremiumPlan): string {
  return `premium:${plan}:monthly`;
}

export function premiumPlanFromPayload(payload?: string): PremiumPlan | undefined {
  const match = payload?.match(/^premium:(basic|pro|ultra):monthly$/);
  return normalizePremiumPlan(match?.[1]);
}

export function isTestPremiumPayload(payload?: string): boolean {
  return payload === TEST_PREMIUM_PAYLOAD;
}
