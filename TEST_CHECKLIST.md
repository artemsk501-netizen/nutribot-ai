# NutriBot Manual Test Checklist

Run automated checks first:

```bash
npm test
npm run typecheck
npm run build
npm run dev
```

Health checks:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/health
```

Telegram smoke test:

- `/start` asks language (🇷🇺 / 🇬🇧 / 🇮🇹) on first run; `🌐 Language` button switches locale.
- `/start` starts onboarding or resumes an incomplete profile.
- `/profile` shows saved profile or asks to complete onboarding.
- Send a food photo: bot shows analysis with confidence, then portion buttons (small / medium / large / grams / edit / discard).
- After portion choice, bot asks `Add to daily stats?` with `✅ Add / ✏️ Edit / ❌ Do not add` (localized).
- Custom grams: enter 1–3000; calories/macros recalculate from per-100g values.
- Edit flow: name → calories → protein → fat → carbs → grams; then confirm again.
- Before pressing `✅ Добавить`, run `/stats`: the analyzed meal is not counted yet.
- Press `✅ Добавить`: meal is saved and `/stats` shows its calories and BJU.
- Send another food photo and press `❌ Не добавлять`: `/stats` does not change.
- Send another food photo and press `✏️ Изменить`: enter calories, protein, fat, carbs step by step; updated values are shown before saving.
- Press `✅ Добавить` after edit: `/stats` shows edited calories and BJU.
- Send 3 food photos as a free user: each successful analysis consumes one scan whether or not the meal is saved.
- Send the 4th food photo as a free user: bot replies with the Premium limit message and does not analyze.
- Ask 3 text nutrition questions as a free user: bot answers with short AI coaching.
- Ask the 4th text question as a free user: bot replies with the Premium limit message and does not call AI.
- `/stats` shows today's real calories, protein, fat and carbs from saved meals.
- `/week` and `/month` show totals from saved meals.
- Restart the bot and run `/stats` again: saved meals and totals remain.
- Buy Premium via `/premium` in a Telegram Stars test/live flow.
- Premium user can send more than 3 photos and 3 AI questions without being blocked.
- `/water` and `/waterstats`: enable/disable reminders, log 150/250/500/custom ml, set goal/interval/quiet hours.
- Water reminder job: no spam during quiet hours (22:00–09:00 default), max 5/day, pauses after 3 days inactivity.
- `/goal`, `/weight`, `/target`, `/notify`, `/help` respond without crashes.
- Premium plans: only Basic (100⭐), Pro (300⭐), Ultra (700⭐); no test/1-star plan.
- Admin user from `ADMIN_IDS` can run `/admin`; non-admin user is blocked.
