# FamilyPulse UX/UI Handoff (MVP, без изменения бизнес-логики)

## 1) Handoff Summary

### Что меняем в UX/UI
- Приводим все экраны к единому AppShell-паттерну: `page-shell` -> hero-card -> action/filter block -> content blocks -> bottom nav.
- Унифицируем интерактивные паттерны: сегментированные переключатели, табы статусов, карточки состояний (`empty/loading/error`), поведение CTA.
- Формализуем AI-native слой: единый язык интерфейса, анатомия AI Suggestion Card, прозрачность источников, стандартизированные действия `approve/reject/ignore`.

### Что сохраняем без изменений
- Не меняем бизнес-логику, API-контракты, порядок запросов и правила safe-mode AI.
- Не меняем предметные сущности и их жизненный цикл (`task/event/routine/ai suggestion`).
- Не меняем Telegram Mini App bootstrap, auth flow и текущую маршрутизацию.

### Как внедряем безопасно
- Внедрение только на уровне presentation/component composition.
- Сначала токены + унификация компонентов, затем экранные улучшения, затем AI polishing.
- Каждая фаза с no-regression проверкой данных, мобильной вёрстки и safe-mode AI действий.

## 2) Current UI -> Target UX Mapping (без изменения логики)

| Текущая реализация | Целевой UX-паттерн handoff | Что именно менять | Что не трогаем |
|---|---|---|---|
| `app/page.tsx` (`Today`) с KPI, фильтрами, списками задач/событий/рутин | `Today Control Center` | Визуально структурировать как: Summary rail -> Focus tasks -> AI strip -> Secondary blocks | `getToday/getTasks/getAiSuggestions` и текущие фильтры |
| `app/tasks/page.tsx` | `Task Workspace` | Единый header с primary CTA, sticky filter chips, предсказуемые empty/loading | Логика `scope/status`, done/update/create |
| `app/ai/page.tsx` | `AI Inbox Review Console` | Чёткая карточка ревью (confidence, source, proposed fields, actions) | Safe-mode операции approve/reject/ignore и refresh |
| `app/calendar/page.tsx` | `Calendar Dual-Mode` | Ясные легенды точек, согласованные индикаторы событий/задач, таб-переключение вида | Данные feed/manual/tasksDue, загрузка диапазона |
| `app/events/page.tsx` + `app/events/[id]/page.tsx` | `Event Planning Flow` | Разделение create-form и event list/detail через стандарт state blocks | API создания события и привязки задач |
| `app/routines/page.tsx` | `Routine Composer + List` | Привести форму к единым полевым правилам, статусы активности через единый badge pattern | `createRoutine/toggleRoutine` семантика |
| `app/home/page.tsx` | `Household Settings` | Секции: Home meta -> Members -> Invites -> Join -> Scoreboard в одном визуальном ритме | `leave/join/createInvite/getScoreboard` |
| `components/nav.tsx` | `Global BottomNav` | Сохранить 7 табов, унифицировать активный/hover/focus states и safe-area поведение | Набор маршрутов и переходы |
| `components/tasks/task-card.tsx` | `Task Row Core` | Формализовать размеры, badge-статусы, плотность контента и действия | Callback-интерфейсы `onDone/onUpdate` |

## 3) Design Tokens / UI Rules (Tailwind + CSS Variables)

### 3.1 Типографика
- `--font-size-title: 22px`, `--line-height-title: 28px` -> `page-title`.
- `--font-size-section: 16px`, `--line-height-section: 22px` -> `section-title`.
- `--font-size-body: 14px`, `--line-height-body: 20px` -> основной текст.
- `--font-size-meta: 12px`, `--line-height-meta: 16px` -> helper/meta.

### 3.2 Spacing и радиусы
- Базовая шкала: `4/6/8/10/12/16` px.
- Минимальные внутренние отступы интерактивных контейнеров: `12px`.
- Карточки: `radius=12px`, sheet top radius: `16px`.
- Вертикальный ритм экрана: `space-y-4`; внутри card: `space-y-2` или `space-y-3`.

### 3.3 Surface/Color roles
- Оставить существующие роли: `background/card/foreground/muted/border/input/ring/primary/success/warning/danger`.
- Добавить AI роли (новые CSS vars):
  - `--ai-bg: 262 100% 97%`
  - `--ai-border: 258 89% 87%`
  - `--ai-foreground: 262 61% 38%`
  - `--ai-accent: 263 70% 50%`
- Добавить focus/interactive роли:
  - `--focus-ring-strong: 221 83% 53%`
  - `--surface-elevated: 0 0% 100%`
  - `--surface-muted: 210 40% 96%`

### 3.4 Interactive states
- `default`: чёткий контраст текста и фона.
- `hover`: не менять layout, только цвет/opacity/shadow.
- `active`: максимум `scale-[0.99]`, без "прыжка".
- `disabled`: `opacity-50`, без интерактивных ховеров.
- `focus-visible`: ring минимум `2px`, обязательный для button/input/tabs/nav item.

### 3.5 Изменения в `globals.css` (без слома текущих классов)
- Добавить перечисленные AI/focus/surface vars в `:root`.
- Оставить все текущие токены как источник правды и не переименовывать существующие переменные.
- Расширить utility-компоненты:
  - `ai-pill` -> опирать на `--ai-*` vars вместо хардкода violet.
  - Добавить `ai-card` (фон/бордер/текст для AI блоков).
  - Добавить `interactive-focus` для консистентного ring.

### 3.6 Изменения в `tailwind.config.ts` (без breaking changes)
- Расширить `theme.extend.colors`:
  - `ai`, `ai-foreground`, `ai-border`, `ai-accent`.
  - `surface-elevated`, `surface-muted`, `focus-ring-strong`.
- Не удалять текущие роли и не менять их имена.
- Не менять `content` paths и `darkMode` поведение на этом этапе.

## 4) Core Components Spec

### 4.1 AppShell
- Назначение: единый каркас мобильных экранов Mini App.
- Состав: page title + optional subtitle + actions + content cards + `BottomNav`.
- Правила:
  - Один главный CTA на экран (если нужен).
  - Сначала критичная информация, затем вторичный контент.
  - Всегда учитывать safe-area снизу.

### 4.2 Card family
- Варианты: `default`, `subtle`, `elevated`.
- Density: `default`, `compact`.
- Состояния: normal/loading/empty/error.
- Контент-правила:
  - Заголовок + helper + action cluster.
  - Не более 2 уровней текста внутри карточки.

### 4.3 Buttons
- Варианты: `default`, `outline`, `secondary`, `ghost`, `destructive`, `ai`.
- Размеры: `default/sm/lg/icon` с min tap-target 44px.
- Состояния: idle/hover/focus/disabled/loading.
- Контент-правила:
  - Императивный глагол: "Создать", "Подтвердить", "Отклонить".
  - Для destructive/critical действий обязателен явный лейбл.

### 4.4 Chips/Badges
- Варианты: `default/success/warning/danger/outline/muted/ai`.
- Использование:
  - статус сущности;
  - тип AI-кандидата;
  - компактные фильтры/легенды.
- Ограничение: badge не должен быть единственным носителем критичной информации.

### 4.5 Segmented control / Tabs
- Для бинарных/кратких режимов (`mine/all`, `open/done/all`, `pending/approved/ignored`).
- Активный сегмент визуально плотнее (`bg-card + shadow-sm`), неактивные — muted.
- Высота control минимум 44px.

### 4.6 Task Row
- Анатомия: checkbox -> title -> secondary meta -> due badge -> edit action.
- Обязательные состояния: open/done/overdue/no-due-date.
- Поведение:
  - `done` мгновенно отражается в UI.
  - `edit` открывает `TaskEditorSheet`.

### 4.7 Progress/KPI
- KPI карточки 2x2 для Today.
- Progress bar: always visible, текстом `done/total`.
- Цвет прогресса не должен конфликтовать со status colors.

### 4.8 Sheets/Modals
- Использовать `Sheet` для create/edit flows.
- Состояния: initial/filling/saving/error.
- Правила:
  - Поля с label над контролом.
  - Основная кнопка закрепляет intent ("Сохранить").

### 4.9 Empty/Loading/Error
- `Loading`: skeleton похожей геометрии.
- `Empty`: короткое объяснение + контекстный CTA.
- `Error`: alert вверху экрана + возможность повторить действие.

### 4.10 Усиленный AI Suggestion Card
- Header: `AI` badge + тип (`task/event/question`) + confidence.
- Body: title + optional description.
- Proposal block: assignee/time/source refs/createdAt.
- Review controls:
  - `Approve` primary,
  - `Reject` outline,
  - `Ignore` ghost.
- Для `TASK` перед approve — editable due-date draft.

## 5) Screen-by-Screen Handoff (9 экранов)

Ниже шаблон внедрения для каждого экрана: цель -> пользовательский вопрос -> layout -> CTA -> states -> AI-native -> UI compression -> оставить неизменным -> notes for developer.

### 5.1 Today (повышенная детализация)
- Цель: дать "операционный пульт дня" семьи.
- Вопрос пользователя: "Что самое важное сегодня и что нужно сделать прямо сейчас?"
- Layout:
  - Hero (`дата`, `home switch`, `scope mine/all`).
  - KPI grid (`today/open`, `overdue`, `events`, `ai pending`).
  - Progress rail.
  - Filter/action strip (`filter`, `new task`).
  - AI signal card (с переходом в inbox).
  - Блоки: tasks -> events -> summary table -> routines -> backlog -> daily meta.
- Primary CTA: `Новая задача`; secondary CTA: `Открыть AI Inbox`.
- States:
  - loading: skeleton внутри задачного блока;
  - empty tasks: state-block с CTA;
  - error: alert в top.
- AI-native элементы: pending count, AI signal text, короткий путь в ревью.
- UI compression: backlog по умолчанию свернут.
- Оставить неизменным: фильтр `overdue/today/week/noDueDate`, `scope`, загрузочные API.
- Notes for developer:
  - держать вычисления KPI в текущих derived variables;
  - не дублировать запросы вне текущего reload/polling паттерна.

### 5.2 Tasks (повышенная детализация)
- Цель: управлять задачами по фильтрам без перегрузки.
- Вопрос: "Какие задачи мои/общие и что с ними сделать?"
- Layout: header+CTA -> scope segmented -> status segmented -> list card.
- CTA: `Новая задача`.
- States: loading skeleton, empty with create CTA, error alert.
- AI-native: мягкая подсказка "если пусто -> проверить AI Inbox".
- UI compression: фильтры в один ряд на мобильном, без горизонтального скролла.
- Оставить неизменным: `getTasks(scope,status)`, done/update/create callbacks.
- Notes: сохранять текущий TaskCard как единицу списка, не внедрять отдельный row-компонент до фазы 2.

### 5.3 Calendar
- Цель: быстро увидеть временную нагрузку и дедлайны.
- Вопрос: "Что и когда у нас запланировано?"
- Layout: title+timezone -> tabs(month/agenda) -> selected-date details -> ICS form -> feeds list.
- CTA: `Подключить календарь`.
- States: empty agenda/feeds/day details, error alert.
- AI-native: не основной экран, только cross-link в будущем.
- UI compression: компактная легенда точек, текст `E:x T:y` оставить.
- Оставить неизменным: month range loading и merge `events + manualEvents`.
- Notes: не менять colorClassByUserId hashing.

### 5.4 Events
- Цель: создать событие и увидеть ближайшие.
- Вопрос: "Как быстро зафиксировать семейное событие?"
- Layout: create form card -> upcoming events card.
- CTA: `Создать событие`.
- States: empty upcoming, form validation by required fields.
- AI-native: future hook — prefill из AI (без внедрения сейчас).
- UI compression: participant selector в компактном блоке.
- Оставить неизменным: create payload shape и date conversions.
- Notes: сохранить простой flow без модалки.

### 5.5 Event Details
- Цель: связать event с задачами.
- Вопрос: "Какие задачи относятся к этому событию?"
- Layout: event meta -> linked tasks list -> add task CTA + editor sheet.
- CTA: `+ Задача`.
- States: empty tasks, error alert.
- AI-native: индикатор источника (добавить позже, backlog).
- UI compression: TaskCard compact density.
- Оставить неизменным: `eventId` привязка в createTask.
- Notes: не менять current loading trigger через `eventId`.

### 5.6 Routines
- Цель: задавать регулярные обязанности.
- Вопрос: "Какие повторяющиеся дела мы выполняем и кто отвечает?"
- Layout: routine composer -> routines list.
- CTA: `Создать рутину`.
- States: loading skeleton, empty state with scroll-to-top CTA.
- AI-native: future suggestion chip (deferred).
- UI compression: day chips и assignee mode toggle.
- Оставить неизменным: `scheduleType`, `daysOfWeek`, `assigneeMode`.
- Notes: сохранить структуру формы без backend validation изменений.

### 5.7 Home
- Цель: управление домом, участниками и инвайтами.
- Вопрос: "Кто в доме, как пригласить и какие очки?"
- Layout: home meta -> members -> invites -> join -> scoreboard.
- CTA: `Создать инвайт` и `Войти по коду`.
- States: empty members/scoreboard, success notice после join.
- AI-native: не основной экран.
- UI compression: карточки участников и scoreboard в одном визуальном ритме.
- Оставить неизменным: leave/join/createInvite API.
- Notes: оставлять `/link` инструкцию в явном виде.

### 5.8 AI Inbox (повышенная детализация)
- Цель: безопасный human-in-the-loop разбор AI кандидатов.
- Вопрос: "Что AI нашёл в чате и что мне подтвердить/отклонить?"
- Layout:
  - Summary card (`summaryText`, daily stats, refresh).
  - Status tabs (`pending/approved/ignored`).
  - Suggestion cards list.
- CTA:
  - global: `Обновить`;
  - local per card: `Подтвердить / Отклонить / Игнорировать`.
- States:
  - loading skeleton;
  - empty by status tab;
  - archived status card (actions disabled);
  - error/success alerts.
- AI-native:
  - confidence labeling;
  - source refs transparency;
  - editable dueDate before approve task.
- UI compression: proposal block в компактной инфо-плашке.
- Оставить неизменным: safe-mode действия и tab-based fetching.
- Notes for developer:
  - не убирать `sourceMessageRefs` из карточки;
  - не auto-approve, только explicit action user.

### 5.9 Onboarding на главной (Today при отсутствии home)
- Цель: быстро создать/выбрать дом или войти по коду.
- Вопрос: "Как начать пользоваться приложением без лишних шагов?"
- Layout: welcome card -> create home card -> join card -> optional homes list.
- CTA: `Создать дом`, `Войти по коду`.
- States: ошибка авторизации/инициализации, homes list fallback.
- AI-native: отсутствует.
- UI compression: минимальное число полей на карточку.
- Оставить неизменным: auth/initData/reAuth flow.
- Notes: не изменять условия, когда показывается onboarding.

## 6) AI-native UX Handoff

### 6.1 Глобальный AI UI language
- Всегда объяснять, что AI предлагает "кандидаты", а не "готовые решения".
- Тон: спокойный, проверяемый, без категоричных утверждений.
- Шаблон текста: "AI нашёл / Предлагает / Проверьте перед подтверждением".

### 6.2 AI Suggestion Card Anatomy
- `Intent row`: badge AI + тип сущности + confidence.
- `Content row`: title + optional description.
- `Evidence row`: source refs count, createdAt.
- `Proposal row`: assignee + due/start/end.
- `Action row`: approve/reject/ignore.

### 6.3 Trust/Transparency patterns
- Явно показывать confidence и источники.
- Для неоднозначных предложений использовать "Нужна проверка".
- Никогда не скрывать действия отмены/игнора на pending карточках.

### 6.4 Action semantics
- `Approve`: создаёт/подтверждает сущность в текущем safe-mode сценарии.
- `Reject`: явно отклоняет предложение, не должно "всплывать" заново как pending.
- `Ignore`: уводит в архивный статус без создания сущности.
- Все действия требуют заметного user intent (кнопка + явный текст).

## 7) Developer Implementation Plan

### Фаза 1: Quick Wins (1-2 итерации)
- Цель: визуальная консистентность без структурных рисков.
- Задачи:
  - добавить новые CSS vars (`ai/focus/surface`) и Tailwind color aliases;
  - унифицировать `ai-pill`, `alert`, `badge` visual rules;
  - выровнять empty/loading блоки на экранах Today/Tasks/AI.
- Риски: низкие (presentation only).
- Зависимости от backend: нет.
- DoD:
  - UI не ломает текущие API флоу;
  - no-regression по основным экранам.

### Фаза 2: Component Unification (2-3 итерации)
- Цель: переиспользуемость и предсказуемое поведение компонентов.
- Задачи:
  - зафиксировать component contract для TaskRow/StateBlock/Segmented controls;
  - унифицировать CTA hierarchy и card densities;
  - привести `Today/Tasks/Events/Routines/Home` к одному композиционному паттерну.
- Риски: средние (touches many screens).
- Зависимости от backend: нет.
- DoD:
  - все ключевые экраны используют один набор core patterns;
  - стабильное поведение в Telegram Mini App viewport.

### Фаза 3: AI-native Polishing (1-2 итерации)
- Цель: улучшить скорость и безопасность human review.
- Задачи:
  - усилить AI Suggestion Card anatomy;
  - стандартизировать microcopy для trust/transparency;
  - добавить мелкие UX-улучшения в Today <-> AI Inbox связку.
- Риски: средние (ошибки в action semantics недопустимы).
- Зависимости от backend: только текущие AI endpoints (без изменений контракта).
- DoD:
  - approve/reject/ignore ясны и однозначны;
  - нулевая регрессия safe-mode поведения.

## 8) Developer QA / Acceptance Checklist

### UX correctness
- [ ] На каждом экране есть явная иерархия: цель -> действие -> контент -> состояние.
- [ ] Тап-таргеты интерактивных элементов >= 44px.
- [ ] Empty/loading/error состояния присутствуют и читаемы.

### Data correctness
- [ ] Фильтры `scope/status/date` не меняют смысл текущих API параметров.
- [ ] После `done/update/create` данные корректно перезагружаются.
- [ ] Today KPI и progress совпадают с источником данных.

### Telegram/mobile constraints
- [ ] Нет горизонтального скролла на ключевых экранах.
- [ ] BottomNav и Sheet учитывают `safe-area`.
- [ ] Контраст и читабельность сохраняются в Telegram контейнере.

### AI safety correctness
- [ ] Pending карточки имеют 3 действия: approve/reject/ignore.
- [ ] Archived (`approved/ignored`) карточки не показывают review-actions.
- [ ] Источники и confidence отображаются перед действием пользователя.

### Consistency / No-regression
- [ ] Не изменены API вызовы и payload contracts.
- [ ] Не изменены auth/reAuth/initData сценарии.
- [ ] Навигация и маршруты остались прежними.

## 9) Handoff Appendix

### 9.1 Naming conventions
- Screen containers: `*Page`.
- Composite blocks: `*Section`, `*Card`, `*Row`.
- States: `isLoading`, `error`, `notice`, `empty`.
- AI actions: `approve/reject/ignore` (без синонимов на уровне API-facing кода).

### 9.2 Mapping старых UI элементов к целевым компонентам
- Inline empty blocks -> `StateBlock`.
- Разрозненные segmented кнопки -> единый segmented/tabs pattern.
- Точечные AI highlight стили -> `ai` token roles + `Badge/Button variant="ai"`.
- Несогласованные плотности карточек -> `Card density`.

### 9.3 Deferred polish backlog
- Добавить soft confirmation для destructive AI действий.
- Уточнить visual legend для calendar dots (shared/personal/feed/task).
- Подготовить компактный header variant для очень длинных заголовков.
- Сделать audit текстов на единый tone-of-voice.

## Топ-10 самых важных UX/UI изменений

1. Единый AppShell-паттерн для всех 9 экранов.
2. Формализация AI Suggestion Card с прозрачными источниками и confidence.
3. Единые действия ревью `approve/reject/ignore` с однозначной семантикой.
4. Унификация empty/loading/error блоков во всех ключевых flows.
5. Введение `ai/focus/surface` токенов без breaking changes.
6. Консистентная типографика и вертикальный ритм под mobile-first.
7. Нормализация CTA hierarchy (один primary intent на экран).
8. Стабильный segmented/tabs паттерн для фильтрации и статусов.
9. Повышение компактности Today через controlled disclosure (backlog collapse).
10. Фазовый rollout с acceptance checklist для безопасного no-regression внедрения.
