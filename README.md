# NutriBot — Production-Ready Telegram AI Calorie Tracker

Telegram-native calorie tracker: Bot + Mini App, OpenAI Vision food analysis, AI nutrition coach, SQLite persistence, Telegram Stars Premium tiers, admin metrics, reminders, exports.

## Возможности

| Функция | Описание |
|---------|----------|
| Фото / текст | Фото еды → OpenAI Vision, обычный текст → AI nutrition coach |
| Команды | `/start`, `/photo`, `/stats`, `/week`, `/month`, `/goal`, `/profile`, `/editgoal`, `/editweight`, `/editactivity`, `/weight`, `/target`, `/notify`, `/premium`, `/help` |
| Inline | `@nutribot_ai борщ` в любом чате |
| Mini App | Сегодня / Неделя / Месяц / Вес / Профиль, графики, Premium, экспорт |
| Хранение | SQLite по умолчанию, авто-миграции |
| Платежи | Telegram Stars: Basic / Pro / Ultra |
| Уведомления | Ежедневные reminders, еженедельные отчёты, предупреждение о цели калорий |
| Premium | Безлимитные сканы, расширенный AI coach, микронутриенты, планы питания, JSON/CSV/PDF export |
| Вес | `/weight`, `/target`, график в Mini App |
| Админка | `/admin`: пользователи, premium, subscriptions, Stars revenue |

## AI Nutrition Coach и лимиты

Бот маршрутизирует сообщения так:

- фото → анализ еды, калории и БЖУ, запись в дневник;
- обычный текст → AI nutrition coach через OpenAI Chat Completions;
- команда Telegram → соответствующий handler.

Free план:

- 3 анализа фото в день;
- 3 AI-вопроса в день;
- короткие ответы до ~300-500 символов;
- onboarding, базовая статистика и дневник.

Premium:

- безлимитные фото и AI-сообщения;
- более подробные рекомендации, meal plans, advanced coaching;
- расширенные premium-функции в зависимости от тарифа Stars.

AI учитывает профиль пользователя, цель, дневную норму калорий, активность, последние приёмы пищи, прогресс веса и premium status. Для оптимизации стоимости используются разные модели: `OPENAI_CHAT_MODEL_FREE` (`gpt-4o-mini`) и `OPENAI_CHAT_MODEL_PREMIUM` (`gpt-4o`).

## Onboarding

После первого `/start` бот запускает пошаговую настройку профиля и продолжает с последнего шага после рестарта:

1. Цель: похудеть / набрать массу / поддерживать вес.
2. Текущий вес: число 30-300 кг.
3. Желаемый вес: число 30-300 кг.
4. Рост: 100-250 см.
5. Возраст: 12-100.
6. Активность: низкая / средняя / высокая.

После завершения бот рассчитывает дневную норму калорий и БЖУ:

- `dailyCalories`
- `proteinGoalG`
- `fatGoalG`
- `carbsGoalG`

Команды управления профилем:

- `/profile` — показать цель, вес, рост, возраст, активность и БЖУ.
- `/editgoal` — изменить цель и пересобрать onboarding.
- `/editweight` — изменить текущий и желаемый вес.
- `/editactivity` — изменить активность и пересчитать норму.

## Быстрый старт

### 1. Конфигурация

```bash
cp .env.example .env
# Заполните BOT_TOKEN, OPENAI_API_KEY, ADMIN_IDS
```

По умолчанию данные хранятся в **SQLite** (`./data/nutribot.db`, создаётся автоматически).

SQLite база создаётся автоматически при запуске.

### 2. Зависимости и запуск

```bash
npm install
npm run build
npm run dev
```

### 3. HTTPS (webhook + Mini App)

```bash
ngrok http 3000
```

В `.env`:

```
WEBHOOK_URL=https://xxxx.ngrok-free.app
MINI_APP_URL=https://xxxx.ngrok-free.app/miniapp/
```

### 4. BotFather

- `/setinline` → placeholder `борщ, овсянка...`
- Menu Button → `https://your-domain/miniapp/`
- Payments → Telegram Stars (`XTR`), provider token пустой
- Аватар и описание бота

### 5. API-ключи

| Ключ | Где взять | Назначение |
|------|-----------|------------|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | Обязателен для AI photo/chat |
| `OPENAI_MODEL` | OpenAI | Vision-анализ еды, по умолчанию `gpt-4o` |
| `OPENAI_CHAT_MODEL_FREE` | OpenAI | AI coach для Free, по умолчанию `gpt-4o-mini` |
| `OPENAI_CHAT_MODEL_PREMIUM` | OpenAI | AI coach для Premium, по умолчанию `gpt-4o` |
| `USDA_API_KEY` | fdc.nal.usda.gov/api-key-signup | Уточнение калорий по базе USDA |
| `SENTRY_DSN` | Sentry project settings | Error monitoring для production |

Без `OPENAI_API_KEY` бот покажет безопасную ошибку. Для локальной отладки без API: `OPENAI_ALLOW_MOCK=true`.

## Premium Stars

| Тариф | Stars | Доступ |
|------|-------|--------|
| Basic | 100 | Базовый premium-анализ |
| Pro | 300 | Микронутриенты, AI-рекомендации, недельные отчёты, JSON/CSV export |
| Ultra | 700 | AI-нутрициолог, планы питания, PDF export, расширенная аналитика |

Покупка: `/premium`. После `successful_payment` сохраняются тариф, `subscriptionPlan=premium`, дата окончания и запись платежа. При истечении срока premium отключается автоматически при следующем чтении профиля.

## Local Docker

```bash
cp .env.example .env
# BOT_TOKEN и OPENAI_API_KEY обязательны
npm run docker:full
```

Локальный Docker использует `Dockerfile.local`, чтобы Railway не выбирал Docker builder автоматически. Данные SQLite хранятся в Docker volume `nutribot_sqlite`. Для 24/7 запуска используйте `npm start` после `npm run build` или hosting с постоянным volume для `/app/data`.

Health check:

```bash
curl https://your-domain/health
curl https://your-domain/api/health
```

## Railway Deployment

Railway должен использовать Nixpacks, не Docker. Это закреплено в `railway.json`.

1. Создайте новый Railway project из GitHub repo.
2. Builder: Nixpacks (`railway.json`).
3. Добавьте переменные из `.env.example`: `BOT_TOKEN`, `OPENAI_API_KEY`, `ADMIN_IDS`, `NODE_ENV`, `SQLITE_PATH`, `SENTRY_DSN`, `BOT_USERNAME`, `WEBHOOK_URL`, `MINI_APP_URL`.
4. Для SQLite подключите persistent volume и задайте `SQLITE_PATH=/app/data/nutribot.db`.
5. Start command: `npm start`.
6. После деплоя выставьте `WEBHOOK_URL=https://your-railway-domain` и `MINI_APP_URL=https://your-railway-domain/miniapp/`.
7. Проверьте `/health`, `/api/health`, затем `/start` в Telegram.

## Переменные окружения

Минимум для production:

- `BOT_TOKEN`
- `OPENAI_API_KEY`
- `ADMIN_IDS`
- `NODE_ENV=production`
- `SQLITE_PATH=/app/data/nutribot.db` или другой persistent path
- `SENTRY_DSN`

См. полный список в `.env.example`.

## API Mini App

| Endpoint | Описание |
|----------|----------|
| `GET /api/stats/today` | Статистика за сегодня |
| `GET /api/stats/week` | Отчёт за 7 дней |
| `GET /api/stats/month` | Отчёт за 30 дней |
| `GET /api/profile` | Профиль и Premium |
| `GET /api/export` | JSON за 30 дней (Pro/Ultra) |
| `GET /api/export.csv` | CSV за 30 дней (Pro/Ultra) |
| `GET /api/export.pdf` | PDF за 30 дней (Ultra) |
| `GET /api/weight` | История веса |
| `GET /api/recipes` | Планы питания (Ultra) |

### Еженедельные отчёты

Еженедельные отчёты: воскресенье 10:00 (`Europe/Moscow`). Ежедневные reminders: 20:00.

- `/notify` — включить/выключить weekly reports
- `/notify daily` — включить/выключить daily reminders
- `WEEKLY_REPORT_CRON`, `DAILY_REMINDER_CRON`, `WEEKLY_REPORT_TZ` в `.env`

## Admin

В `.env`: `ADMIN_IDS=123456,987654`.

- `/admin` — пользователи, premium, активные подписки, доход Stars, количество записей еды/веса.

## Security

- `.env` не коммитится.
- Mini App `initData` валидируется HMAC.
- Rate limit: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_MESSAGES`.
- Ошибки OpenAI санитизируются, API keys не выводятся.
- Telegram photo скачивается сервером и отправляется в OpenAI как корректный `data:image/jpeg|png|webp;base64`.

Заголовок: `X-Telegram-Init-Data` (HMAC проверяется на сервере).

## Структура

```
src/
  bot/              Grammy handlers
  api/              Express webhook + REST
  db/sqlite         SQLite connection + migrations
  db/migrations     Optional PostgreSQL migrations
  jobs/             reminders and weekly reports
  services/         store, foodAnalysis, premium, exports
  data/foods-ru.json
miniapp/            Vite + Telegram WebApp
docker-compose.yml
```

## Листинг и рост

- [appss.pro/create-app](https://appss.pro/create-app)
- Inline mode для виральности
- Партнёрства с ЗОЖ-каналами

## Документация Telegram

- [Bot platform](https://core.telegram.org/bots)
- [Mini Apps](https://core.telegram.org/bots/webapps)
- [Telegram Stars](https://core.telegram.org/bots/payments-stars)
