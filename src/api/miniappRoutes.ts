import { Router } from "express";
import { config } from "../config.js";
import { parseInitDataUser, validateInitData } from "../services/telegramAuth.js";
import { hasPremiumFeature, PREMIUM_PLANS } from "../services/premium.js";
import { suggestRecipes } from "../services/recipes.js";
import { getStore } from "../services/store.js";
import { getPool, hasDatabase } from "../db/pool.js";
import { renderStatsPdf } from "../services/pdfExport.js";

export const miniappApiRouter = Router();

function getInitData(req: { headers: Record<string, unknown>; query: Record<string, unknown> }): string | undefined {
  return (
    (req.headers["x-telegram-init-data"] as string) ||
    (req.query.initData as string)
  );
}

function requireTelegramAuth(
  initData: string | undefined,
): { userId: number } | { error: string; status: number } {
  if (!initData) {
    return { error: "Missing Authorization (initData)", status: 401 };
  }
  if (!validateInitData(initData, config.BOT_TOKEN)) {
    return { error: "Invalid initData signature", status: 403 };
  }
  const user = parseInitDataUser(initData);
  if (!user?.id) {
    return { error: "User not found in initData", status: 400 };
  }
  return { userId: user.id };
}

miniappApiRouter.get("/api/stats/today", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const store = getStore();
  const profile = await store.getUser(auth.userId);
  const stats = await store.getDayStats(auth.userId, date, {
    includeMicronutrients: hasPremiumFeature(profile, "micronutrients"),
  });

  res.json({
    stats,
    profile: profile
      ? {
          goal: profile.goal,
          premium: profile.premium,
          premiumPlan: profile.premiumPlan,
          onboardingComplete: profile.onboardingComplete,
          weeklyReportsEnabled: profile.weeklyReportsEnabled,
        }
      : null,
  });
});

miniappApiRouter.get("/api/stats/week", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const store = getStore();
  const week = await store.getWeekStats(auth.userId);
  const profile = await store.getUser(auth.userId);

  res.json({
    week,
    profile: profile
      ? { goal: profile.goal, premium: profile.premium, premiumPlan: profile.premiumPlan }
      : null,
  });
});

miniappApiRouter.get("/api/stats/month", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const store = getStore();
  const month = await store.getMonthStats(auth.userId);
  const profile = await store.getUser(auth.userId);

  res.json({
    month,
    profile: profile
      ? { goal: profile.goal, premium: profile.premium, premiumPlan: profile.premiumPlan }
      : null,
  });
});

miniappApiRouter.get("/api/profile", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const profile = await getStore().getUser(auth.userId);
  res.json({
    profile: profile
      ? {
          telegramId: profile.telegramId,
          firstName: profile.firstName,
          goal: profile.goal,
          premium: profile.premium,
          premiumPlan: profile.premiumPlan,
          premiumExpiresAt: profile.premiumExpiresAt,
          weeklyReportsEnabled: profile.weeklyReportsEnabled,
          dailyRemindersEnabled: profile.dailyRemindersEnabled,
        }
      : null,
    plans: PREMIUM_PLANS,
  });
});

miniappApiRouter.get("/api/export", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const store = getStore();
  const profile = await store.getUser(auth.userId);

  if (!hasPremiumFeature(profile, "exportStats")) {
    res.status(402).json({ error: "Pro or Ultra required", code: "PREMIUM_REQUIRED" });
    return;
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = shiftDate(end, -29);
  const meals = await store.getMealsBetween(auth.userId, start, end);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="nutribot-${end}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    userId: auth.userId,
    from: start,
    to: end,
    meals,
  });
});

miniappApiRouter.get("/api/export.csv", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const store = getStore();
  const profile = await store.getUser(auth.userId);

  if (!hasPremiumFeature(profile, "exportStats")) {
    res.status(402).json({ error: "Pro or Ultra required", code: "PREMIUM_REQUIRED" });
    return;
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = shiftDate(end, -29);
  const meals = await store.getMealsBetween(auth.userId, start, end);
  const rows = [
    ["date", "dish", "calories", "protein_g", "fat_g", "carbs_g"].join(","),
    ...meals.map((meal) =>
      [
        meal.createdAt,
        csvCell(meal.dishName),
        meal.calories,
        meal.macros.proteinG,
        meal.macros.fatG,
        meal.macros.carbsG,
      ].join(","),
    ),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="nutribot-${end}.csv"`);
  res.send(rows.join("\n"));
});

miniappApiRouter.get("/api/export.pdf", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const store = getStore();
  const profile = await store.getUser(auth.userId);

  if (!hasPremiumFeature(profile, "exportPdf")) {
    res.status(402).json({ error: "Ultra required", code: "ULTRA_REQUIRED" });
    return;
  }

  const end = new Date().toISOString().slice(0, 10);
  const start = shiftDate(end, -29);
  const meals = await store.getMealsBetween(auth.userId, start, end);
  const pdf = renderStatsPdf({ userId: auth.userId, from: start, to: end, meals });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nutribot-${end}.pdf"`);
  res.send(pdf);
});

miniappApiRouter.get("/api/weight", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const history = await getStore().getWeightHistory(auth.userId, 30);
  const profile = await getStore().getUser(auth.userId);
  res.json({ history, targetWeightKg: profile?.goal?.targetWeightKg });
});

miniappApiRouter.get("/api/recipes", async (req, res) => {
  const auth = requireTelegramAuth(getInitData(req));
  if ("error" in auth) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }
  const store = getStore();
  const user = await store.getUser(auth.userId);
  if (!hasPremiumFeature(user, "mealPlans")) {
    res.status(402).json({ error: "Ultra required", code: "ULTRA_REQUIRED" });
    return;
  }
  const week = await store.getWeekStats(auth.userId);
  res.json({ recipes: suggestRecipes(user?.goal, week) });
});

miniappApiRouter.get("/api/health", async (_req, res) => {
  let db: string = "skipped";
  if (hasDatabase()) {
    try {
      await getPool().query("SELECT 1");
      db = "ok";
    } catch {
      db = "error";
    }
  }
  res.json({ ok: db !== "error", service: "nutribot", db: hasDatabase() ? db : "sqlite" });
});

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
