# FamilyPulse

Прототип семейного task-manager для Telegram Mini App.

## Стек

- Backend: `Node.js 20` + `TypeScript` + `Express` + `Prisma` + `Zod`
- Bot: `Telegraf` (код реализован в отдельных модулях)
- DB: `Postgres`
- Frontend: `Next.js App Router` + `Tailwind` + базовые `shadcn/ui`-подобные компоненты
- Infra: `docker-compose` + `Caddy` (HTTPS reverse proxy)

## Архитектура

- `backend` — REST API, авторизация Telegram, бизнес-логика задач/рутин/очков.
- `web` — Telegram Mini App, экраны onboarding/today/tasks/routines/home.
- `web/app/api/proxy/[...path]/route.ts` — server-side proxy (web -> backend), чтобы клиент не бил напрямую в API-домен.
- `db` — Postgres.
- `caddy` — HTTPS прокси:
  - `api.* -> backend:4000`
  - `app.* -> web:3000`

## Что реализовано

### 1) Домен и БД

Сущности (`Prisma`):
- `User`
- `Home`
- `HomeMember`
- `Invite`
- `Task`
- `Routine`
- `RoutineInstance`
- `ScoreEvent`
- `Streak`
- `ChatLink`

Обязательные уникальности:
- `HomeMember(homeId, userId)`
- `Invite(code)`
- `RoutineInstance(routineId, date)`
- `Streak(homeId, date)`
- `ScoreEvent(homeId, userId, sourceType, sourceId)`
- `ChatLink(homeId, telegramChatId)`

### 2) Auth и ACL

- `POST /auth/telegram`:
  - принимает `initData`
  - валидирует HMAC подпись Telegram (`WebAppData`)
  - проверяет `auth_date` (просрочка/будущее)
  - не использует `initDataUnsafe`
  - upsert пользователя и выдача JWT (`HS256`)
- `requireAuth` — проверка Bearer JWT.
- `requireHome` — проверка `activeHomeId` + членства пользователя в доме.

### 3) API

#### Homes / Invites
- `POST /homes`
- `GET /homes/current`
- `POST /homes/switch`
- `POST /invites` (owner only)
- `POST /invites/join` (транзакционно, учитывает лимит/срок invite)

#### Tasks
- `POST /tasks`
- `GET /tasks?scope=mine|all&date=YYYY-MM-DD`
- `PATCH /tasks/:id` (status/assigneeId/dueDate)
- `POST /tasks/:id/done` (идемпотентно, начисление очков через `ScoreEvent`)

#### Routines
- `POST /routines` (owner only, строгая валидация DAILY/WEEKLY + FIXED/ROTATE)
- `GET /routines`
- `POST /routines/:id/toggle`

#### Today / Scoreboard
- `GET /today?scope=mine|all&date=YYYY-MM-DD`
  - создаёт `RoutineInstance` на день при необходимости
  - возвращает `tasks`, `routineInstances`, `streakClosed`, `pointsToday`, `doneCount`, `totalCount`
- `POST /routine-instances/:id/done` (идемпотентно)
- `GET /scoreboard?period=week|month`

### 4) Логика рутин и очков

- Генерация инстансов рутин на дату в `/today`.
- Для `ROTATE`: индекс назначения = `Number(YYYYMMDD) % memberCount`.
- Повторные `done` не дают повторные очки (уникальность `ScoreEvent`).
- Закрытие дня в `Streak` идемпотентно за счёт уникальности `(homeId, date)`.

### 5) Telegram Bot и Scheduler (реализовано в коде)

В `backend/src/bot.ts`:
- `/start`
- `/app`
- `/help`
- `/invite`
- `/link`
- `/digest`
- callback `checkin:<homeId>:<dateYmd>`

В `backend/src/scheduler.ts`:
- cron каждую минуту
- для каждого `ChatLink.enabled=true`:
  - `09:00` локального времени дома: отправка дайджеста (1 раз/день)
  - `21:30` локального времени дома: отправка чек-ина с callback кнопкой (1 раз/день)

### 6) Mini App UI

- `Onboarding` на главной: создать дом / войти по invite-коду.
- `Today`: переключение `mine/all`, прогресс, points, streak, done по tasks/routines.
- `Tasks`: создание, смена assignee, смена статуса.
- `Routines`: создание (DAILY/WEEKLY, FIXED/ROTATE), toggle active.
- `Home`: участники, инвайт, статус привязки группового чата, scoreboard.

### 7) Дополнительная устойчивость web

- API-запросы идут через `/api/proxy/...`.
- Для `401` на главной добавлена повторная авторизация (сброс токена + новый `auth/telegram`).
- Обработаны частые ошибки WebView (`load failed` и т.п.) с человекочитаемыми сообщениями.

## Важный текущий статус запуска

- Модули бота/планировщика реализованы (`backend/src/bot.ts`, `backend/src/scheduler.ts`).
- Текущий `backend/src/index.ts` поднимает только Express API.
- Если нужен runtime bot/scheduler в одном процессе, entrypoint нужно связать с запуском Telegraf и cron.

## ENV

Скопируйте:

```bash
cp .env.example .env
```

Обязательные переменные:
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_MINI_APP_NAME`
- `MINI_APP_URL`
- `BACKEND_URL`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_URL`

## Локальный запуск

```bash
docker compose up --build
```

Сервисы:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5432`
- Caddy: `:80`, `:443`

## Миграции и seed

- Миграция: `backend/prisma/migrations/0001_init/migration.sql`
- Seed: `backend/prisma/seed.ts`
  - создаёт 2 demo-пользователя (`telegramId=10001`, `10002`)
  - создаёт demo-дом и 1 demo-задачу

## Структура проекта

- `backend/src/app.ts` — API роуты и основная бизнес-логика.
- `backend/src/auth.ts` — валидация Telegram initData + JWT.
- `backend/src/middleware.ts` — auth/home middleware.
- `backend/src/services.ts` — idempotent points, routine generation, digest builder.
- `backend/src/bot.ts` — команды бота и callback.
- `backend/src/scheduler.ts` — планировщик дайджест/чек-ин.
- `web/app/page.tsx` — главная (onboarding + today).
- `web/app/tasks/page.tsx` — задачи.
- `web/app/routines/page.tsx` — рутины.
- `web/app/home/page.tsx` — дом/инвайты/scoreboard.
- `web/app/api/proxy/[...path]/route.ts` — proxy в backend.
- `docker-compose.yml` — оркестрация сервисов.
- `Caddyfile` — HTTPS reverse proxy правила.
