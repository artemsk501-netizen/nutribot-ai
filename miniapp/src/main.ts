import "./style.css";
import {
  apiFetch,
  escapeHtml,
  progressBar,
  renderMicronutrientsHtml,
  type DayStatsResponse,
  type MonthStatsResponse,
  type ProfileResponse,
  type RecipesResponse,
  type WeekStatsResponse,
  type WeightResponse,
} from "./api.js";

const tg = window.Telegram?.WebApp;
type Tab = "today" | "week" | "month" | "weight" | "profile";
let activeTab: Tab = "today";

function applyTheme(): void {
  if (!tg) return;
  const root = document.documentElement;
  const p = tg.themeParams;
  if (p.bg_color) root.style.setProperty("--tg-bg", p.bg_color);
  if (p.text_color) root.style.setProperty("--tg-text", p.text_color);
  if (p.button_color) root.style.setProperty("--tg-button", p.button_color);
  if (p.button_text_color) root.style.setProperty("--tg-button-text", p.button_text_color);
  if (p.secondary_bg_color) root.style.setProperty("--tg-secondary", p.secondary_bg_color);
  document.body.dataset.theme = tg.colorScheme;
}

function renderToday(data: DayStatsResponse): void {
  const { stats, profile } = data;
  const target = stats.goal?.dailyCalories ?? 2000;
  const pct = Math.min(100, Math.round((stats.totalCalories / target) * 100));
  const name = tg?.initDataUnsafe.user?.first_name ?? "друг";

  const mealsHtml =
    stats.meals.length > 0
      ? stats.meals
          .map(
            (m) =>
              `<li class="meal-item">
                <span class="meal-name">${escapeHtml(m.dishName)}</span>
                <span class="meal-kcal">${m.calories} ккал</span>
              </li>`,
          )
          .join("")
      : '<li class="empty">Пока нет записей — отправьте фото еды боту 📷</li>';

  const content = document.getElementById("content");
  if (!content) return;

  content.innerHTML = `
    <section class="card greeting">
      <p>Привет, ${escapeHtml(name)}! 👋</p>
      ${profile?.premium ? `<span class="badge">⭐ ${profile.premiumPlan?.toUpperCase() ?? "Premium"}</span>` : ""}
    </section>
    <section class="card progress-card">
      <div class="progress-label">Калории сегодня</div>
      <div class="progress-bar">${progressBar(pct)}</div>
      <div class="progress-numbers">
        <strong>${stats.totalCalories}</strong> / ${target} ккал
        <span class="remaining">осталось ${stats.remainingCalories}</span>
      </div>
    </section>
    <section class="card macros">
      <h2>БЖУ</h2>
      <div class="macro-grid">
        <div><span>Белки</span><strong>${stats.totalMacros.proteinG}г</strong></div>
        <div><span>Жиры</span><strong>${stats.totalMacros.fatG}г</strong></div>
        <div><span>Углеводы</span><strong>${stats.totalMacros.carbsG}г</strong></div>
      </div>
    </section>
    <section class="card meals">
      <h2>Приёмы пищи</h2>
      <ul>${mealsHtml}</ul>
    </section>
    ${profile?.premium && stats.totalMicronutrients ? renderMicronutrientsHtml(stats.totalMicronutrients, "Микронутриенты за день") : ""}
    ${renderExportSection(profile?.premiumPlan)}
  `;

  bindExportButton();
}

function renderPeriod(week: WeekStatsResponse["week"], profile: WeekStatsResponse["profile"], title: string): void {
  const target = week.goal?.dailyCalories ?? profile?.goal?.dailyCalories ?? 2000;
  const maxCal = Math.max(...week.days.map((d) => d.totalCalories), target, 1);

  const bars = week.days
    .map((d) => {
      const h = Math.max(4, Math.round((d.totalCalories / maxCal) * 100));
      const dayLabel = d.date.slice(8, 10);
      return `
        <div class="chart-col" title="${d.date}: ${d.totalCalories} ккал">
          <div class="chart-bar" style="height:${h}%"></div>
          <span class="chart-label">${dayLabel}</span>
        </div>`;
    })
    .join("");

  const content = document.getElementById("content");
  if (!content) return;

  content.innerHTML = `
    <section class="card">
      <h2>${title} ${week.weekStart.slice(5)} — ${week.weekEnd.slice(5)}</h2>
      <p class="week-summary">
        <strong>${week.totalCalories}</strong> ккал всего ·
        ~<strong>${week.avgCaloriesPerDay}</strong> ккал/день
      </p>
    </section>
    <section class="card chart-card">
      <div class="chart">${bars}</div>
      <p class="chart-legend">Цель: ${target} ккал/день</p>
    </section>
    <section class="card insight">
      <h2>Рекомендация</h2>
      <p>${escapeHtml(week.insight)}</p>
    </section>
    <section class="card macros">
      <h2>БЖУ за период</h2>
      <div class="macro-grid">
        <div><span>Белки</span><strong>${week.totalMacros.proteinG}г</strong></div>
        <div><span>Жиры</span><strong>${week.totalMacros.fatG}г</strong></div>
        <div><span>Углеводы</span><strong>${week.totalMacros.carbsG}г</strong></div>
      </div>
    </section>
    <section class="card recipes" id="recipes-section">
      <h2>🍳 Планы питания</h2>
      <p class="loading-recipes">Загрузка...</p>
    </section>
    ${renderExportSection(profile?.premiumPlan)}
  `;

  bindExportButton();
  void loadRecipes();
}

function renderWeek(data: WeekStatsResponse): void {
  renderPeriod(data.week, data.profile, "Неделя");
}

function renderMonth(data: MonthStatsResponse): void {
  renderPeriod(data.month, data.profile, "30 дней");
}

async function loadRecipes(): Promise<void> {
  const el = document.querySelector("#recipes-section");
  if (!el) return;
  try {
    const res = await apiFetch("/api/recipes");
    if (res.status === 402) {
      el.innerHTML = "<h2>🍳 Планы питания</h2><p>Доступно в Ultra</p>";
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as RecipesResponse;
    const list = data.recipes.length
      ? `<ul>${data.recipes.map((r) => `<li>${escapeHtml(r.replace(/^•\s*/, ""))}</li>`).join("")}</ul>`
      : "<p>Нет предложений</p>";
    el.innerHTML = `<h2>🍳 Идеи на неделю</h2>${list}`;
  } catch {
    el.innerHTML = "<h2>🍳 Идеи на неделю</h2><p>Не удалось загрузить</p>";
  }
}

function renderWeight(data: WeightResponse): void {
  const { history, targetWeightKg } = data;
  const entries = history.entries;
  const content = document.getElementById("content");
  if (!content) return;

  if (entries.length === 0) {
    content.innerHTML = `
      <section class="card">
        <h2>⚖️ Вес</h2>
        <p>Записей пока нет. В боте отправьте: <code>/weight 72.5</code></p>
      </section>`;
    return;
  }

  const maxW = Math.max(...entries.map((e) => e.weightKg));
  const minW = Math.min(...entries.map((e) => e.weightKg));
  const range = Math.max(maxW - minW, 1);

  const bars = entries
    .slice(-14)
    .map((e) => {
      const h = Math.max(8, Math.round(((e.weightKg - minW) / range) * 100));
      const label = e.createdAt.slice(8, 10);
      return `
        <div class="chart-col" title="${e.createdAt.slice(0, 10)}: ${e.weightKg} кг">
          <div class="chart-bar weight-bar" style="height:${h}%"></div>
          <span class="chart-label">${label}</span>
        </div>`;
    })
    .join("");

  let summary = history.latest
    ? `<p class="week-summary">Текущий: <strong>${history.latest.weightKg}</strong> кг</p>`
    : "";
  if (history.changeKg != null) {
    const sign = history.changeKg > 0 ? "+" : "";
    summary += `<p>Изменение: ${sign}${history.changeKg} кг</p>`;
  }
  if (targetWeightKg && history.latest) {
    const diff = Math.round((history.latest.weightKg - targetWeightKg) * 10) / 10;
    const sign = diff > 0 ? "+" : "";
    summary += `<p>🎯 До цели (${targetWeightKg} кг): ${sign}${diff} кг</p>`;
  }

  content.innerHTML = `
    <section class="card">
      <h2>⚖️ Динамика веса</h2>
      ${summary}
    </section>
    <section class="card chart-card">
      <div class="chart">${bars}</div>
    </section>
    <section class="card">
      <h2>Последние записи</h2>
      <ul class="weight-list">
        ${[...entries].reverse().slice(0, 5).map((e) => `<li>${e.createdAt.slice(0, 10)} — <strong>${e.weightKg}</strong> кг</li>`).join("")}
      </ul>
    </section>`;
}

function renderProfile(data: ProfileResponse): void {
  const content = document.getElementById("content");
  if (!content) return;
  const profile = data.profile;
  const plan = profile?.premiumPlan?.toUpperCase() ?? "Free";
  const expires = profile?.premiumExpiresAt?.slice(0, 10) ?? "нет";
  content.innerHTML = `
    <section class="card">
      <h2>👤 Профиль</h2>
      <p>ID: <strong>${profile?.telegramId ?? "-"}</strong></p>
      <p>Premium: <strong>${escapeHtml(plan)}</strong></p>
      <p>Действует до: <strong>${escapeHtml(expires)}</strong></p>
      <p>Weekly reports: ${profile?.weeklyReportsEnabled ? "вкл" : "выкл"}</p>
      <p>Daily reminders: ${profile?.dailyRemindersEnabled ? "вкл" : "выкл"}</p>
    </section>
    <section class="card">
      <h2>⭐ Premium</h2>
      <p><strong>Basic</strong> — 100 Stars: базовый анализ.</p>
      <p><strong>Pro</strong> — 300 Stars: микронутриенты, рекомендации, отчёты, JSON/CSV.</p>
      <p><strong>Ultra</strong> — 700 Stars: планы питания, PDF, расширенная аналитика.</p>
      <p>Купить тариф можно в боте командой <code>/premium</code>.</p>
    </section>`;
}

function renderExportSection(plan?: "basic" | "pro" | "ultra"): string {
  if (!plan || plan === "basic") {
    return `
      <section class="card export-locked">
        <p>⭐ Экспорт статистики — Pro/Ultra</p>
        <button type="button" class="btn-secondary" disabled>Нужен Pro или Ultra</button>
      </section>`;
  }
  const pdfButton =
    plan === "ultra"
      ? '<button type="button" class="btn-secondary" id="export-pdf-btn">Скачать PDF</button>'
      : "";
  return `
    <section class="card export">
      <h2>Экспорт</h2>
      <p>Скачать записи за 30 дней</p>
      <button type="button" class="btn-primary" id="export-btn">Скачать JSON</button>
      <button type="button" class="btn-secondary" id="export-csv-btn">Скачать CSV</button>
      ${pdfButton}
    </section>`;
}

function bindExportButton(): void {
  const btn = document.getElementById("export-btn");
  if (!btn || !tg?.initData) return;
  btn.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/export");
      if (res.status === 402) {
        alert("Нужен Premium");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nutribot-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка экспорта");
    }
  });

  const csvBtn = document.getElementById("export-csv-btn");
  csvBtn?.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/export.csv");
      if (res.status === 402) {
        alert("Нужен Pro или Ultra");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nutribot-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка CSV-экспорта");
    }
  });

  const pdfBtn = document.getElementById("export-pdf-btn");
  pdfBtn?.addEventListener("click", async () => {
    try {
      const res = await apiFetch("/api/export.pdf");
      if (res.status === 402) {
        alert("Нужен Ultra");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nutribot-export.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ошибка PDF-экспорта");
    }
  });
}

async function loadTab(tab: Tab): Promise<void> {
  const content = document.getElementById("content");
  if (!tg?.initData) {
    if (content) content.innerHTML = '<p class="error">Откройте через Telegram Mini App</p>';
    return;
  }

  if (content) content.innerHTML = '<p class="loading">Загрузка...</p>';

  try {
    if (tab === "today") {
      const res = await apiFetch("/api/stats/today");
      if (!res.ok) throw new Error(String(res.status));
      renderToday((await res.json()) as DayStatsResponse);
    } else if (tab === "week") {
      const res = await apiFetch("/api/stats/week");
      if (!res.ok) throw new Error(String(res.status));
      renderWeek((await res.json()) as WeekStatsResponse);
    } else if (tab === "month") {
      const res = await apiFetch("/api/stats/month");
      if (!res.ok) throw new Error(String(res.status));
      renderMonth((await res.json()) as MonthStatsResponse);
    } else if (tab === "profile") {
      const res = await apiFetch("/api/profile");
      if (!res.ok) throw new Error(String(res.status));
      renderProfile((await res.json()) as ProfileResponse);
    } else {
      const res = await apiFetch("/api/weight");
      if (!res.ok) throw new Error(String(res.status));
      renderWeight((await res.json()) as WeightResponse);
    }
  } catch (err) {
    if (content) content.innerHTML = '<p class="error">Не удалось загрузить данные</p>';
    console.error(err);
  }
}

function setupTabs(): void {
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      const tab = (el as HTMLElement).dataset.tab as Tab;
      if (!tab || tab === activeTab) return;
      activeTab = tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      el.classList.add("active");
      void loadTab(tab);
    });
  });
}

function setupMainButton(): void {
  if (!tg) return;
  tg.MainButton.setText("Закрыть");
  tg.MainButton.show();
  tg.MainButton.onClick(() => tg.close());
}

async function init(): Promise<void> {
  tg?.ready();
  tg?.expand();
  applyTheme();
  setupTabs();
  setupMainButton();
  await loadTab("today");
}

init();
