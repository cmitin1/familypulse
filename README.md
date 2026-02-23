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
- `web` — Telegram Mini App, экраны onboarding/today/tasks/routines/home/ai.
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
- `TaskAssignee`
- `Event`
- `EventParticipant`
- `TelegramMessage`
- `AiChatConnection`
- `AiExtractionRun`
- `AiSuggestion`

Обязательные уникальности:
- `HomeMember(homeId, userId)`
- `Invite(code)`
- `RoutineInstance(routineId, date)`
- `Streak(homeId, date)`
- `ScoreEvent(homeId, userId, sourceType, sourceId)`
- `ChatLink(homeId, telegramChatId)`
- `TelegramMessage(telegramChatId, telegramMessageId)`
- `AiChatConnection(homeId, telegramChatId)`

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
- поддержка `assigneeIds[]` (несколько исполнителей + совместимость с `assigneeId`)
- `GET /tasks?scope=mine|all&date=YYYY-MM-DD` + расширенные фильтры:
  - `from`, `to`, `status=open|done|all`, `assigneeId`, `overdue=true|false`, `noDueDate=true|false`
- `PATCH /tasks/:id` (title/status/assigneeIds/dueDate/eventId)
- `POST /tasks/:id/done` (идемпотентно, начисление очков через `ScoreEvent`)
- `GET /tasks/summary/by-assignee?from=YYYY-MM-DD&to=YYYY-MM-DD`

#### Calendar (ICS)
- `GET /calendar/feeds`
- `POST /calendar/feeds` (`title`, `icsUrl`)
- `PATCH /calendar/feeds/:id` (`title`, `icsUrl`, `isEnabled`)
- `DELETE /calendar/feeds/:id`
- `POST /calendar/feeds/:id/sync`
- `GET /calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&includeTasks=true|false`

#### Events
- `POST /events`
- `GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /events/:id`
- `PATCH /events/:id`
- `DELETE /events/:id`

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

#### AI (MVP v1, safe mode)
- `GET /ai/suggestions?status=&type=&limit=&cursor=`
- `POST /ai/suggestions/:id/approve`
- `POST /ai/suggestions/:id/reject`
- `POST /ai/suggestions/:id/ignore`
- `GET /ai/summary/today`
- `GET /ai/summary/digest?hours=24`

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
- `/ai_on`
- `/ai_off`
- `/digest`
- `/today`
- `/ai_tasks`
- callback `checkin:<homeId>:<dateYmd>`
- входящие сообщения чата сохраняются в `TelegramMessage` (дедуп по `(telegramChatId, telegramMessageId)`).
- `/link` привязывает чат к дому и оставляет AI выключенным по умолчанию.
- `/ai_on` и `/ai_off` (owner, в группе) явно управляют AI-анализом чата.
- `/today` возвращает компактную сводку по дому (tasks/routines/events + AI pending).
- `/digest` возвращает краткую сводку за 24 часа с блоком “что обсуждали” и счетчиками AI suggestions.

В `backend/src/scheduler.ts`:
- cron каждую минуту
- синк enabled ICS feed'ов каждые `CALENDAR_SYNC_INTERVAL_MINUTES`
- для каждого `ChatLink.enabled=true`:
  - `09:00` локального времени дома: отправка дайджеста (1 раз/день)
  - `09:00` (`REMINDER_MORNING_TIME`): задачи на сегодня (1 раз/день)
  - `19:00` (`REMINDER_EVENING_TIME`): просроченные + дедлайн завтра (1 раз/день)
  - `21:30` локального времени дома: отправка чек-ина с callback кнопкой (1 раз/день)
- hourly AI analysis (safe mode): новые сообщения из `TelegramMessage` -> OpenRouter -> `AiExtractionRun` + `AiSuggestion` (статус `PENDING`).
- утренний авто-дайджест (09:00) использует digest v2, если включены `AI_FEATURE_ENABLED` и `AI_DIGEST_V2_ENABLED`; при ошибках LLM автоматически уходит в deterministic fallback.

### 5.1) AI Native MVP v1 (safe mode)

- AI-модуль изолирован в `backend/src/modules/ai`.
- LLM не создаёт `Task/Event` напрямую.
- OpenRouter extraction возвращает строгий JSON, который валидируется через `zod`.
- Невалидный/ошибочный AI-run логируется в `AiExtractionRun(status=ERROR)` и не валит backend.
- Feature flags:
  - `AI_FEATURE_ENABLED`
  - `AI_DIGEST_V2_ENABLED`
  - `AI_CHAT_ANALYSIS_ENABLED`
  - `AI_CHAT_ANALYSIS_BATCH_LIMIT`
  - `AI_CHAT_PROMPT_VERSION`
  - `OPENROUTER_*`
- API:
  - `GET /ai/suggestions`
  - `POST /ai/suggestions/:id/approve|reject|ignore`
  - `GET /ai/summary/today`
  - `GET /ai/summary/digest?hours=24`
  - для обратной совместимости старые поля summary сохранены, а v2-текст добавляется отдельным полем (`textV2`, `version`).
- Mini App: новый раздел `/ai` (AI Inbox) с действиями approve/reject/ignore.
- Safe mode: после `/link` AI-анализ чата **выключен по умолчанию**, включается явно командой `/ai_on` (owner), выключение `/ai_off`.
- Digest v2: двухслойный формат (deterministic JSON context + LLM formatter) с детерминированным fallback при ошибках LLM.

### 6) Mini App UI

- `Onboarding` на главной: создать дом / войти по invite-коду.
- `Today` как dashboard: компактная шапка (дата/дом/mine-all), задачи на сегодня в приоритете, события на сегодня, быстрые фильтры, компактная строка прогресса.
- `Tasks`: компактный `TaskRow`/`TaskCard`, мульти-исполнители, создание/редактирование (title, assignees, dueDate, status), D-days и просрочка.
- `Calendar`: month + agenda, события из ICS + ручные события, цветные точки, задачи с дедлайнами по выбранной дате.
- `Events`: отдельный раздел событий и карточка события с привязанными задачами.
- `Routines`: создание (DAILY/WEEKLY, FIXED/ROTATE), toggle active.
- `Home`: участники, инвайт, статус привязки группового чата, scoreboard.
- `AI Inbox` (`/ai`): pending suggestions, действия статусов (подтвердить/отклонить/игнорировать), today-stats и ручное обновление.

### 6.1) UI/UX стандартизация (light theme)

- Добавлен краткий дизайн-спек: `web/UI-DESIGN-SPEC.md`.
- Единые дизайн-токены через CSS vars/Tailwind в:
  - `web/app/globals.css`
  - `web/tailwind.config.ts`
- Унифицированы базовые компоненты:
  - `web/components/ui/button.tsx`
  - `web/components/ui/input.tsx`
  - `web/components/ui/card.tsx`
  - `web/components/ui/badge.tsx`
  - `web/components/ui/alert.tsx`
  - `web/components/ui/table.tsx`
  - `web/components/ui/tabs.tsx`
  - `web/components/ui/sheet.tsx`
  - `web/components/ui/skeleton.tsx`
- Mobile-first и safe-area:
  - tap-targets `~44px` (`h-11/min-h-11`) для интерактивных элементов,
  - стабильные safe-area отступы в layout/nav/sheet.

### 7) Дополнительная устойчивость web

- API-запросы идут через `/api/proxy/...`.
- Для `401` на главной добавлена повторная авторизация (сброс токена + новый `auth/telegram`).
- Обработаны частые ошибки WebView (`load failed` и т.п.) с человекочитаемыми сообщениями.

## Runtime режимы запуска

`backend/src/index.ts` теперь запускает:
- Express API (всегда)
- Telegraf bot (если `ENABLE_BOT=true`)
- Scheduler (если `ENABLE_SCHEDULER=true`)

Это позволяет запускать API-only, либо all-in-one процесс.

## ENV

Скопируйте:

```bash
cp .env.example .env
```

Обязательные переменные:
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ENABLE_BOT`
- `ENABLE_SCHEDULER`
- `CALENDAR_SYNC_INTERVAL_MINUTES`
- `REMINDER_MORNING_TIME`
- `REMINDER_EVENING_TIME`
- `CHECKIN_TIME`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_MINI_APP_NAME`
- `MINI_APP_URL`
- `BACKEND_URL`
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_URL`
- `AI_FEATURE_ENABLED`
- `AI_DIGEST_V2_ENABLED`
- `AI_CHAT_ANALYSIS_ENABLED`
- `AI_CHAT_ANALYSIS_BATCH_LIMIT`
- `AI_CHAT_PROMPT_VERSION`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL_EXTRACT`
- `OPENROUTER_MODEL_SUMMARY`

## Локальный запуск

```bash
docker compose up --build
```

По умолчанию в compose включены bot+scheduler. Для API-only:

```bash
ENABLE_BOT=false ENABLE_SCHEDULER=false docker compose up --build
```

Сервисы:
- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Postgres: `localhost:5432`
- Caddy: `:80`, `:443`

## AI: pre-production safe checklist

1. Проверить миграции и генерацию Prisma:
   - `cd backend`
   - `npx prisma migrate deploy`
   - `npx prisma generate`
2. Проверить базовые AI-тесты:
   - `npm run test:ai`
3. Включать AI только после ручной валидации:
   - `AI_FEATURE_ENABLED=true`
   - `AI_DIGEST_V2_ENABLED=true`
   - `AI_CHAT_ANALYSIS_ENABLED=true`
   - `OPENROUTER_API_KEY=<key>`
4. Для каждого чата AI включается явно через `/ai_on` (после `/link` по умолчанию выключен).
5. Проверить rollback-план:
   - мгновенно отключить AI: `AI_CHAT_ANALYSIS_ENABLED=false` (или `AI_FEATURE_ENABLED=false`)
   - остальные backend/web/bot фичи должны продолжать работать штатно.

## Миграции и seed

- Миграции:
  - `backend/prisma/migrations/0001_init/migration.sql`
  - `backend/prisma/migrations/20260223160000_calendar_and_deadline_notifications/migration.sql`
  - `backend/prisma/migrations/20260224113000_events_and_multi_assignees/migration.sql`
  - `backend/prisma/migrations/20260223190000_ai_native_mvp_v1/migration.sql`
- Seed: `backend/prisma/seed.ts`
  - создаёт 2 demo-пользователя (`telegramId=10001`, `10002`)
  - создаёт demo-дом и 1 demo-задачу

## Календарь (MVP)

1. Откройте экран `Календарь`.
2. Добавьте feed: название + публичный ICS URL (Google/Apple/другой iCal).
3. Нажмите `Sync` для ручной синхронизации.
4. События появятся в month/agenda и в деталях выбранной даты.
5. Scheduler также выполняет фоновый sync enabled feed’ов.

## Manual QA checklist

- `docker compose up --build` поднимает web/api/db/caddy без ошибок.
- При `ENABLE_BOT=true` бот запускается, команды `/start` и `/app` работают.
- При `ENABLE_SCHEDULER=true` scheduler стартует и не падает.
- Добавление ICS feed создаёт запись в БД, `POST /calendar/feeds/:id/sync` подтягивает события.
- `/calendar/events` возвращает события и `tasksDue` в диапазоне.
- Задача создаётся/редактируется с `dueDate`, в UI видны D-days и просрочка.
- Быстрые фильтры на главной (`Просроченные`, `Сегодня`, `7 дней`, `Без дедлайна`) возвращают ожидаемые задачи.
- Таблица сводки по ответственным показывает `open/overdue/dueSoon/doneToday`.
- 2 пользователя в одном доме видят общие задачи/события.
- В задаче можно выбрать 1/нескольких исполнителей, включая быстрое “Все”.
- В `Today` отображаются и задачи, и события на сегодня.
- В календаре месяца отображаются цветные точки на датах с событиями.
- Можно создать событие-диапазон и добавить к нему задачи из event details.
- В `Routines` кнопка переключения на русском: `Отключить`/`Включить`.
- AI Inbox (`/ai`) показывает pending suggestions и позволяет approve/reject/ignore.
- AI Inbox (`/ai`) показывает pending suggestions и позволяет менять статусы карточек.
- При выключенном `AI_FEATURE_ENABLED=false` backend/bot отвечают корректно без падения.
- После `/link` AI для чата выключен, включается только через `/ai_on` (owner).
- `/today` и `/digest` в боте отдают компактную сводку с AI-блоком.

## Структура проекта

- `backend/src/app.ts` — API роуты и основная бизнес-логика.
- `backend/src/auth.ts` — валидация Telegram initData + JWT.
- `backend/src/middleware.ts` — auth/home middleware.
- `backend/src/services.ts` — idempotent points, routine generation, digest builder.
- `backend/src/bot.ts` — команды бота и callback.
- `backend/src/scheduler.ts` — планировщик дайджест/чек-ин.
- `backend/src/modules/ai/*` — AI-модуль (schemas/services/routes/jobs).
- `web/app/page.tsx` — главная (onboarding + today).
- `web/app/ai/page.tsx` — AI Inbox.
- `web/app/tasks/page.tsx` — задачи.
- `web/app/routines/page.tsx` — рутины.
- `web/app/home/page.tsx` — дом/инвайты/scoreboard.
- `web/app/api/proxy/[...path]/route.ts` — proxy в backend.
- `web/UI-DESIGN-SPEC.md` — короткий UI/UX дизайн-спек.
- `docker-compose.yml` — оркестрация сервисов.
- `Caddyfile` — HTTPS reverse proxy правила.
