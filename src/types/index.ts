export type GoalType = "lose" | "gain" | "maintain";

export type ActivityLevel = "low" | "medium" | "high";

export type OnboardingStep =
  | "goal"
  | "current_weight"
  | "target_weight"
  | "height"
  | "age"
  | "activity"
  | "complete";

export type PremiumPlan = "basic" | "pro" | "ultra";

export type SubscriptionPlan = "free" | "premium";

export type UsageKind = "photo_scan" | "ai_message";

export type PremiumFeature =
  | "basicAnalysis"
  | "micronutrients"
  | "aiRecommendations"
  | "weeklyReports"
  | "personalNutritionist"
  | "mealPlans"
  | "exportStats"
  | "exportPdf"
  | "advancedAnalytics";

export interface UserGoal {
  type: GoalType;
  targetWeightKg?: number;
  dailyCalories: number;
}

export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** Premium: оценка микронутриентов на порцию */
export interface Micronutrients {
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  vitaminCMg?: number;
  ironMg?: number;
  calciumMg?: number;
}

export type CaloriesSource = "ai" | "usda" | "blend" | "local";

export interface MealEntry {
  id: string;
  userId: number;
  dishName: string;
  calories: number;
  macros: Macros;
  advice?: string;
  photoFileId?: string;
  usdaFdcId?: number;
  caloriesSource?: CaloriesSource;
  micronutrients?: Micronutrients;
  createdAt: string;
}

export interface UserProfile {
  telegramId: number;
  firstName?: string;
  languageCode?: string;
  referredBy?: number;
  goal?: UserGoal;
  currentWeightKg?: number;
  targetWeightKg?: number;
  heightCm?: number;
  age?: number;
  activityLevel?: ActivityLevel;
  proteinGoalG?: number;
  fatGoalG?: number;
  carbsGoalG?: number;
  onboardingStep?: OnboardingStep;
  onboardingComplete: boolean;
  subscriptionPlan: SubscriptionPlan;
  premium: boolean;
  premiumPlan?: PremiumPlan;
  premiumExpiresAt?: string;
  weeklyReportsEnabled: boolean;
  lastWeeklyReportAt?: string;
  dailyRemindersEnabled: boolean;
  lastDailyReminderAt?: string;
  scansToday: number;
  aiMessagesToday: number;
  lastUsageDate?: string;
  createdAt: string;
}

export interface UsageStatus {
  kind: UsageKind;
  allowed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  plan: SubscriptionPlan;
}

export interface PaymentRecord {
  id: string;
  userId: number;
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  payload: string;
  plan: PremiumPlan;
  stars: number;
  currency: "XTR";
  createdAt: string;
}

export interface WeightEntry {
  id: string;
  userId: number;
  weightKg: number;
  createdAt: string;
}

export interface WeightHistory {
  entries: WeightEntry[];
  latest?: WeightEntry;
  changeKg?: number;
}

export interface FoodAnalysisResult {
  dishName: string;
  searchQueryEn?: string;
  calories: number;
  macros: Macros;
  advice: string;
  usdaFdcId?: number;
  caloriesSource?: CaloriesSource;
  micronutrients?: Micronutrients;
}

export interface DayStats {
  date: string;
  meals: MealEntry[];
  totalCalories: number;
  totalMacros: Macros;
  totalMicronutrients?: Micronutrients;
  goal?: UserGoal;
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
  goal?: UserGoal;
  insight: string;
}

export type MonthStats = WeekStats;

export interface AdminMetrics {
  totalUsers: number;
  freeUsers: number;
  premiumUsers: number;
  conversionRate: number;
  activeSubscriptions: number;
  totalStars: number;
  paymentsCount: number;
  mealsCount: number;
  weightsCount: number;
  referralsCount: number;
  scansToday: number;
  aiMessagesToday: number;
}

export interface ReferralStats {
  referralCode: string;
  referralsCount: number;
  referredBy?: number;
}
