"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api, getErrorMessage } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskEditorSheet } from "@/components/tasks/task-editor-sheet";
import { TasksSummaryTable } from "@/components/tasks/tasks-summary-table";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { StateBlock } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, Plus } from "lucide-react";

declare global {
  interface Window {
    Telegram?: any;
  }
}

export default function TodayPage() {
  const [token, setTokenState] = useState("");
  const [status, setStatus] = useState("Инициализация...");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [home, setHome] = useState<any>(null);
  const [homes, setHomes] = useState<any[]>([]);
  const [today, setToday] = useState<any>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [joinCode, setJoinCode] = useState("");
  const [homeName, setHomeName] = useState("Наш дом");
  const [notice, setNotice] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [taskFilter, setTaskFilter] = useState<"overdue" | "today" | "week" | "noDueDate">("today");
  const [editorOpen, setEditorOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [aiPendingCount, setAiPendingCount] = useState<number | null>(null);
  const [aiPendingLabel, setAiPendingLabel] = useState("—");

  function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  function ymd(date: Date) {
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  async function waitForInitData(maxAttempts = 12, delayMs = 250): Promise<string> {
    for (let i = 0; i < maxAttempts; i += 1) {
      const tg = window.Telegram?.WebApp;
      const value = tg?.initData;
      if (value && typeof value === "string" && value.length > 0) {
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return "";
  }

  async function reAuth(): Promise<string> {
    const initData = await waitForInitData();
    if (!initData) {
      throw new Error("Не получили initData для повторной авторизации");
    }
    const resp = await api.authTelegram(initData);
    setToken(resp.token);
    setTokenState(resp.token);
    setHomes(resp.homes ?? []);
    setStatus("OK");
    setError("");
    return resp.token as string;
  }

  async function withReAuth<T>(action: (actualToken: string) => Promise<T>): Promise<T> {
    try {
      return await action(token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        setTokenState("");
        const newToken = await reAuth();
        return action(newToken);
      }
      throw err;
    }
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();

    waitForInitData()
      .then((initData) => {
        const existing = getToken();
        if (!initData) {
          if (existing) {
            setTokenState(existing);
            setStatus("OK");
            setError("");
            setIsLoading(false);
            return;
          }
          setStatus(tg ? "Не получили initData. Откройте Mini App через бота." : "Откройте страницу из Telegram Mini App");
          setIsLoading(false);
          return;
        }
        return api
          .authTelegram(initData)
          .then((resp) => {
            setToken(resp.token);
            setTokenState(resp.token);
            setHomes(resp.homes ?? []);
            setStatus("OK");
            setError("");
          })
          .catch((err) => {
            clearToken();
            setTokenState("");
            setStatus("Ошибка авторизации Telegram");
            setError(getErrorMessage(err));
          })
          .finally(() => setIsLoading(false));
      })
      .catch((err) => {
        setStatus("Ошибка инициализации Mini App");
        setError(getErrorMessage(err));
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    const now = new Date();
    const from = ymd(now);
    const to = ymd(addDays(now, 7));
    const tasksQuery =
      taskFilter === "overdue"
        ? { scope, status: "open" as const, overdue: true }
        : taskFilter === "today"
          ? { scope, from, to: from }
          : taskFilter === "week"
            ? { scope, from, to }
            : { scope, noDueDate: true };
    withReAuth(async (actualToken) => {
      const currentHome = await api.getCurrentHome(actualToken);
      if (!currentHome?.id) {
        setHome(currentHome);
        setToday(null);
        setTasks([]);
        setBacklogTasks([]);
        setSummary([]);
        setAiPendingCount(null);
        setAiPendingLabel("—");
        return;
      }
      const [t, taskRows, summaryRows, openRows, aiSuggestionsResp] = await Promise.all([
        api.getToday(actualToken, scope),
        api.getTasks(actualToken, tasksQuery),
        api.getTasksSummaryByAssignee(actualToken, from, to),
        api.getTasks(actualToken, { scope, status: "open" as const }),
        api
          .getAiSuggestions(actualToken, { status: "pending", limit: 50 })
          .catch(() => null)
      ]);
      setHome(currentHome);
      setToday(t);
      setTasks(taskFilter === "today" ? (t?.tasks ?? []) : taskRows);
      const todayIds = new Set((t?.tasks ?? []).map((task: any) => task.id));
      setBacklogTasks((openRows ?? []).filter((task: any) => !todayIds.has(task.id)));
      setSummary(summaryRows);
      if (aiSuggestionsResp && Array.isArray(aiSuggestionsResp.rows)) {
        const hasMore = Boolean(aiSuggestionsResp.nextCursor);
        const shownCount = aiSuggestionsResp.rows.length;
        setAiPendingCount(shownCount);
        setAiPendingLabel(hasMore && shownCount >= 50 ? "50+" : String(shownCount));
      } else {
        setAiPendingCount(null);
        setAiPendingLabel("AI выкл");
      }
    })
      .then(() => {
        setStatus("OK");
        setError("");
      })
      .catch((err) => {
        setStatus("Не удалось загрузить данные");
        setError(getErrorMessage(err));
      })
      .finally(() => setIsLoading(false));
  }, [token, scope, taskFilter]);

  async function reload() {
    if (!token) return;
    setIsLoading(true);
    try {
      const now = new Date();
      const from = ymd(now);
      const to = ymd(addDays(now, 7));
      const tasksQuery =
        taskFilter === "overdue"
          ? { scope, status: "open" as const, overdue: true }
          : taskFilter === "today"
            ? { scope, from, to: from }
            : taskFilter === "week"
              ? { scope, from, to }
              : { scope, noDueDate: true };
      await withReAuth(async (actualToken) => {
        const currentHome = await api.getCurrentHome(actualToken);
        if (!currentHome?.id) {
          setHome(currentHome);
          setToday(null);
          setTasks([]);
          setBacklogTasks([]);
          setSummary([]);
          setAiPendingCount(null);
          setAiPendingLabel("—");
          return;
        }
        const [t, taskRows, summaryRows, openRows, aiSuggestionsResp] = await Promise.all([
          api.getToday(actualToken, scope),
          api.getTasks(actualToken, tasksQuery),
          api.getTasksSummaryByAssignee(actualToken, from, to),
          api.getTasks(actualToken, { scope, status: "open" as const }),
          api
            .getAiSuggestions(actualToken, { status: "pending", limit: 50 })
            .catch(() => null)
        ]);
        setHome(currentHome);
        setToday(t);
        setTasks(taskFilter === "today" ? (t?.tasks ?? []) : taskRows);
        const todayIds = new Set((t?.tasks ?? []).map((task: any) => task.id));
        setBacklogTasks((openRows ?? []).filter((task: any) => !todayIds.has(task.id)));
        setSummary(summaryRows);
        if (aiSuggestionsResp && Array.isArray(aiSuggestionsResp.rows)) {
          const hasMore = Boolean(aiSuggestionsResp.nextCursor);
          const shownCount = aiSuggestionsResp.rows.length;
          setAiPendingCount(shownCount);
          setAiPendingLabel(hasMore && shownCount >= 50 ? "50+" : String(shownCount));
        } else {
          setAiPendingCount(null);
          setAiPendingLabel("AI выкл");
        }
      });
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  if (!token && status !== "OK") {
    return (
      <Card className="space-y-2">
        <h1 className="page-title">FamilyPulse</h1>
        <p className="page-subtitle">{status}</p>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </Card>
    );
  }

  if (!home?.id) {
    return (
      <div className="page-shell">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Card className="space-y-3">
          <h1 className="page-title">Добро пожаловать в FamilyPulse</h1>
          <p className="page-subtitle">Создайте дом или присоединитесь по инвайт-коду.</p>
          <Input value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="Название дома" />
          <Button
            onClick={async () => {
              try {
                await withReAuth((actualToken) => api.createHome(actualToken, homeName, "Europe/Moscow"));
                await reload();
              } catch (err) {
                setError(getErrorMessage(err));
              }
            }}
          >
            Создать дом
          </Button>
        </Card>
        <Card className="space-y-3">
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Инвайт-код" />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await withReAuth((actualToken) => api.joinInvite(actualToken, joinCode));
                await reload();
              } catch (err) {
                setError(getErrorMessage(err));
              }
            }}
          >
            Войти по коду
          </Button>
        </Card>
        {(homes ?? []).length > 0 ? (
          <Card className="space-y-3">
            <p className="text-sm text-slate-600">Или выберите дом для входа:</p>
            <div className="space-y-2">
              {homes.map((h: any) => (
                <Button
                  key={h.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={async () => {
                    try {
                      await withReAuth((actualToken) => api.switchHome(actualToken, h.id));
                      await reload();
                    } catch (err) {
                      setError(getErrorMessage(err));
                    }
                  }}
                >
                  {h.name}
                </Button>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    );
  }

  const done = today?.doneCount ?? 0;
  const total = today?.totalCount ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const todayLabel = `Сегодня, ${new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short"
  }).format(new Date())}`;
  const todayDateStart = today?.date ? new Date(`${today.date}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
  const overdueCount = backlogTasks.filter((task: any) => task?.dueDate && new Date(task.dueDate) < todayDateStart).length;
  const todayOpenCount = (today?.tasks ?? []).filter((task: any) => task.status === "OPEN").length;
  const todayEventsCount = (today?.events ?? []).length;
  const aiSignalText =
    aiPendingCount && aiPendingCount > 0
      ? `AI нашел ${aiPendingCount} кандидатов из чата. Проверьте и подтвердите нужные.`
      : "Новых AI-кандидатов пока нет. Если в чате были договоренности, обновите AI Inbox позже.";
  const activeFilterLabel =
    taskFilter === "overdue"
      ? "Просроченные"
      : taskFilter === "today"
        ? "Сегодня"
        : taskFilter === "week"
          ? "7 дней"
          : "Без дедлайна";

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="info">{notice}</Alert> : null}
      <Card className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="page-title">{todayLabel}</h1>
            <p className="text-xs text-muted-foreground">{today?.date ?? "—"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" className="px-2.5" onClick={() => (window.location.href = "/home")}>
              {home?.name ?? "Дом"}
            </Button>
            <Tabs value={scope} onValueChange={(value) => setScope(value as "mine" | "all")} className="w-[132px]">
              <TabsList columns={2}>
                <TabsTrigger value="mine">Мои</TabsTrigger>
                <TabsTrigger value="all">Все</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
            <p className="helper-text">Сегодня</p>
            <p className="kpi-value">{todayOpenCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
            <p className="helper-text">Просрочено</p>
            <p className="kpi-value">{overdueCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
            <p className="helper-text">События</p>
            <p className="kpi-value">{todayEventsCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
            <p className="helper-text">AI / Pending</p>
            <p className="kpi-value">{aiPendingLabel}</p>
          </div>
        </div>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{done}/{total} выполнено сегодня</p>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline" className="truncate">
              Фильтр: {activeFilterLabel}
            </Badge>
            {aiPendingCount === null ? <Badge variant="outline">AI временно недоступен</Badge> : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="w-11 px-0"
              aria-label="Фильтры"
              title="Фильтры"
              onClick={() => setShowFilters((value) => !value)}
            >
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="w-11 px-0"
              aria-label="Новая задача"
              title="Новая задача"
              onClick={() => setEditorOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showFilters ? (
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-2">
            <Button size="sm" variant={taskFilter === "overdue" ? "default" : "outline"} onClick={() => setTaskFilter("overdue")}>
              Просроченные
            </Button>
            <Button size="sm" variant={taskFilter === "today" ? "default" : "outline"} onClick={() => setTaskFilter("today")}>
              Сегодня
            </Button>
            <Button size="sm" variant={taskFilter === "week" ? "default" : "outline"} onClick={() => setTaskFilter("week")}>
              7 дней
            </Button>
            <Button size="sm" variant={taskFilter === "noDueDate" ? "default" : "outline"} onClick={() => setTaskFilter("noDueDate")}>
              Без дедлайна
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <div className="ai-card flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="section-title text-ai-foreground">AI сигналы</p>
            <p className="helper-text text-ai-foreground/90">{aiSignalText}</p>
          </div>
          <Link href="/ai" className="ai-pill">
            Открыть AI Inbox
          </Link>
        </div>
      </Card>

      {isLoading ? (
        <Card className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      ) : (
        <>
          <Card className="space-y-2">
            <h2 className="section-title">Задачи на сегодня</h2>
            {tasks.length === 0 ? (
              <StateBlock
                message="Сегодня нет активных задач. Можно добавить новую или проверить AI Inbox."
                actionLabel="Создать задачу"
                onAction={() => setEditorOpen(true)}
              />
            ) : (
              tasks.map((task: any) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={home?.members ?? []}
                  timezone={home?.timezone ?? "UTC"}
                  onDone={async (id) => {
                    await api.doneTask(token, id);
                    await reload();
                  }}
                  onUpdate={async (id, payload) => {
                    await api.updateTask(token, id, payload);
                    await reload();
                  }}
                />
              ))
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="section-title">События на сегодня</h2>
            {(today?.events ?? []).length === 0 ? (
              <p className="empty-state">Сегодня событий нет.</p>
            ) : (
              (today?.events ?? []).map((event: any) => (
                <Link key={event.id} href={`/events/${event.id}`} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} -{" "}
                      {new Date(event.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant="outline">Событие</Badge>
                </Link>
              ))
            )}
          </Card>

          <TasksSummaryTable
            rows={summary}
            tasks={tasks}
            members={home?.members ?? []}
            timezone={home?.timezone ?? "UTC"}
            onDone={async (id) => {
              await api.doneTask(token, id);
              await reload();
            }}
            onUpdate={async (id, payload) => {
              await api.updateTask(token, id, payload);
              await reload();
            }}
          />

          <Card className="space-y-2">
            <h2 className="section-title">Рутины</h2>
            {(today?.routineInstances ?? []).length === 0 ? (
              <p className="empty-state">Нет рутин на сегодня — добавьте первую.</p>
            ) : (
              (today?.routineInstances ?? []).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium">{item.routine.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.assignee?.firstName || item.assignee?.username || "Без исполнителя"}
                    </p>
                  </div>
                  {item.isDone ? (
                    <Badge variant="success" className="gap-1">
                      <StatusIndicator kind="done" />
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.doneRoutineInstance(token, item.id);
                          await reload();
                        } catch (err) {
                          setError(getErrorMessage(err));
                        }
                      }}
                    >
                      Выполнить
                    </Button>
                  )}
                </div>
              ))
            )}
          </Card>
          <Card className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title">Остальные задачи (не на сегодня)</h2>
              <Button size="sm" variant="outline" onClick={() => setShowBacklog((value) => !value)}>
                {showBacklog ? "Свернуть" : "Показать"}
              </Button>
            </div>
            {showBacklog ? (
              backlogTasks.length === 0 ? (
                <p className="empty-state">Нет дополнительных открытых задач.</p>
              ) : (
                backlogTasks.map((task: any) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={home?.members ?? []}
                    timezone={home?.timezone ?? "UTC"}
                    onDone={async (id) => {
                      await api.doneTask(token, id);
                      await reload();
                    }}
                    onUpdate={async (id, payload) => {
                      await api.updateTask(token, id, payload);
                      await reload();
                    }}
                  />
                ))
              )
            ) : (
              <p className="helper-text">Скрыто для компактности. Разверните при необходимости.</p>
            )}
          </Card>
          <Card className="space-y-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>Прогресс: {done}/{total}</span>
              <span>Выполнено: {progress}%</span>
              <span>Очки: {today?.pointsToday ?? 0}</span>
              <span className="inline-flex items-center gap-1">
                Стрик:
                {today?.streakClosed ? <StatusIndicator kind="closed" /> : <StatusIndicator kind="open" />}
              </span>
            </p>
          </Card>
        </>
      )}
      <TaskEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        members={home?.members ?? []}
        onSave={async (payload) => {
          await api.createTask(token, {
            title: payload.title,
            assigneeIds: payload.assigneeIds ?? undefined,
            dueDate: payload.dueDate ?? undefined,
            points: 5
          });
          await reload();
        }}
      />
      <BottomNav />
    </div>
  );
}
