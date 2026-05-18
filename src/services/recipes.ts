import type { GoalType, UserGoal, WeekStats } from "../types/index.js";

interface Recipe {
  title: string;
  kcal: number;
  tags: GoalType[];
}

const RECIPES: Recipe[] = [
  { title: "Овсянка с ягодами и грецкими орехами", kcal: 320, tags: ["lose", "maintain"] },
  { title: "Куриная грудка с гречкой и салатом", kcal: 450, tags: ["lose", "maintain", "gain"] },
  { title: "Творог 5% с бананом", kcal: 280, tags: ["lose", "gain"] },
  { title: "Омлет из 3 яиц со шпинатом", kcal: 380, tags: ["lose", "maintain", "gain"] },
  { title: "Лосось с киноа и брокколи", kcal: 520, tags: ["gain", "maintain"] },
  { title: "Смузи: протеин + банан + арахисовая паста", kcal: 480, tags: ["gain"] },
  { title: "Греческий салат с фетой", kcal: 290, tags: ["lose", "maintain"] },
  { title: "Плов с курицей (порция 300г)", kcal: 510, tags: ["gain", "maintain"] },
];

export function suggestRecipes(goal?: UserGoal, week?: WeekStats): string[] {
  const type = goal?.type ?? "maintain";
  let pool = RECIPES.filter((r) => r.tags.includes(type));

  if (week && week.avgCaloriesPerDay > (goal?.dailyCalories ?? 2000) * 1.1) {
    pool = pool.filter((r) => r.kcal < 400);
  } else if (week && week.avgCaloriesPerDay < (goal?.dailyCalories ?? 2000) * 0.85) {
    pool = pool.filter((r) => r.kcal >= 400);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((r) => `• ${r.title} (~${r.kcal} ккал)`);
}

export function formatRecipeBlock(goal?: UserGoal, week?: WeekStats): string {
  const items = suggestRecipes(goal, week);
  if (items.length === 0) return "";
  return `\n\n🍳 **Идеи на неделю:**\n${items.join("\n")}`;
}
