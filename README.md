# FamilyPulse (Telegram Mini App + Bot)

Рабочий прототип семейного task-manager для Telegram Mini App по ТЗ:
- Backend: Node.js 20 + TypeScript + Express + Prisma + Zod
- Bot: Telegraf
- DB: Postgres
- Web: Next.js App Router + Tailwind + базовые shadcn/ui-компоненты
- Infra: docker-compose (`db`, `backend`, `web`)

## A→G (что реализовано)

### A) Scaffolding + docker-compose + Prisma
- Монорепо с папками `backend` и `web`
- `docker-compose.yml` с сервисами `db`, `backend`, `web`
- Prisma schema + миграция `backend/prisma/migrations/0001_init/migration.sql`
- Seed: `backend/prisma/seed.ts`

### B) Auth initData + JWT + middleware
- `POST /auth/telegram`: серверная HMAC-валидация `Telegram.WebApp.initData`
- JWT выдача и middleware `requireAuth`
- `initDataUnsafe` не используется

### C) Homes + activeHome + invites
- `/homes` create/current/switch
- `/invites` create/join
- `activeHomeId` хранится в `User`

### D) Tasks + Today
- `/tasks` create/list/done (идемпотентно по очкам через `ScoreEvent` unique)
- `/today` возвращает tasks + routine instances + streak state
- UI: экран `Today` + `Tasks`

### E) Routines + RoutineInstance + UI
- `/routines` create/list/toggle
- Генерация `RoutineInstance` при `/today`
- `ROTATE`: `(YYYYMMDD mod count)` по списку участников
- UI: экран `Routines`

### F) Bot + /link + scheduler
- Bot команды: `/start`, `/invite`, `/link`, `/digest`, `/help`
- В группах Mini App ссылка формата:
  `https://t.me/<botusername>/<appname>?startapp=<payload>`
- Scheduler: тикер раз в минуту, по timezone дома:
  - 09:00 утренний дайджест (1 раз/день)
  - 21:30 чек-ин с callback-кнопкой “Закрыть день ✅” (1 раз/день)

### G) Полировка
- ACL: только member activeHome может работать с home-данными
- Zod-валидация основных входных DTO
- Идемпотентность done через уникальные ограничения и `ScoreEvent`

## Сущности и уникальные ограничения

В `backend/prisma/schema.prisma` добавлены сущности:
- `User`, `Home`, `HomeMember`, `Invite`, `Task`, `Routine`, `RoutineInstance`, `ScoreEvent`, `Streak`, `ChatLink`

И обязательные уникальности:
- `HomeMember(homeId,userId)`
- `RoutineInstance(routineId,date)`
- `Streak(homeId,date)`
- `ScoreEvent(homeId,userId,sourceType,sourceId)`

## Telegram детали

- Авторизация Mini App только через `initData` + HMAC на сервере.
- Для группового открытия Mini App используются direct links (`startapp`, `tgWebAppStartParam`).
- В прототипе сообщения в группу отправляются ботом (`sendMessage`).

## ENV

1) Скопируйте:
```bash
cp .env.example .env
```
2) Заполните:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `MINI_APP_URL` (публичный URL web, например через туннель)
- `JWT_SECRET`

## Запуск

```bash
docker compose up --build
```

Сервисы:
- Web: `http://localhost:3000`
- Backend: `http://localhost:4000`
- DB: `localhost:5432`

## Основные API

- `POST /auth/telegram`
- `POST /homes`, `GET /homes/current`, `POST /homes/switch`
- `POST /invites`, `POST /invites/join`
- `POST /tasks`, `GET /tasks`, `POST /tasks/:id/done`
- `POST /routines`, `GET /routines`, `POST /routines/:id/toggle`
- `GET /today`, `POST /routine-instances/:id/done`
- `GET /scoreboard`

## Файлы

- `docker-compose.yml`
- `.env.example`
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/Dockerfile`
- `backend/src/index.ts`
- `backend/src/app.ts`
- `backend/src/auth.ts`
- `backend/src/middleware.ts`
- `backend/src/bot.ts`
- `backend/src/scheduler.ts`
- `backend/src/services.ts`
- `backend/src/config.ts`
- `backend/src/db.ts`
- `backend/src/types.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/0001_init/migration.sql`
- `backend/prisma/migrations/migration_lock.toml`
- `backend/prisma/seed.ts`
- `web/package.json`
- `web/Dockerfile`
- `web/next.config.mjs`
- `web/tailwind.config.ts`
- `web/postcss.config.mjs`
- `web/tsconfig.json`
- `web/next-env.d.ts`
- `web/app/layout.tsx`
- `web/app/globals.css`
- `web/app/page.tsx`
- `web/app/tasks/page.tsx`
- `web/app/routines/page.tsx`
- `web/app/home/page.tsx`
- `web/components/nav.tsx`
- `web/components/ui/button.tsx`
- `web/components/ui/card.tsx`
- `web/components/ui/input.tsx`
- `web/lib/api.ts`
- `web/lib/session.ts`
- `web/lib/utils.ts`
