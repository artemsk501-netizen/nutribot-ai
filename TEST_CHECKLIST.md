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

- `/start` starts onboarding or resumes an incomplete profile.
- `/profile` shows saved profile or asks to complete onboarding.
- Send 3 food photos as a free user: each photo is analyzed and saved.
- Send the 4th food photo as a free user: bot replies with the Premium limit message and does not analyze.
- Ask 3 text nutrition questions as a free user: bot answers with short AI coaching.
- Ask the 4th text question as a free user: bot replies with the Premium limit message and does not call AI.
- `/stats` shows today's real calories, protein, fat and carbs from saved meals.
- `/week` and `/month` show totals from saved meals.
- Restart the bot and run `/stats` again: saved meals and totals remain.
- Buy Premium via `/premium` in a Telegram Stars test/live flow.
- Premium user can send more than 3 photos and 3 AI questions without being blocked.
- `/goal`, `/weight`, `/target`, `/notify`, `/help` respond without crashes.
- Admin user from `ADMIN_IDS` can run `/admin`; non-admin user is blocked.
