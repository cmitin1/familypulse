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
        return;
      }
      const [t, taskRows, summaryRows, openRows] = await Promise.all([
        api.getToday(actualToken, scope),
        api.getTasks(actualToken, tasksQuery),
        api.getTasksSummaryByAssignee(actualToken, from, to),
        api.getTasks(actualToken, { scope, status: "open" as const })
      ]);
      setHome(currentHome);
      setToday(t);
      setTasks(taskFilter === "today" ? (t?.tasks ?? []) : taskRows);
      const todayIds = new Set((t?.tasks ?? []).map((task: any) => task.id));
      setBacklogTasks((openRows ?? []).filter((task: any) => !todayIds.has(task.id)));
      setSummary(summaryRows);
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
          return;
        }
        const [t, taskRows, summaryRows, openRows] = await Promise.all([
          api.getToday(actualToken, scope),
          api.getTasks(actualToken, tasksQuery),
          api.getTasksSummaryByAssignee(actualToken, from, to),
          api.getTasks(actualToken, { scope, status: "open" as const })
        ]);
        setHome(currentHome);
        setToday(t);
        setTasks(taskFilter === "today" ? (t?.tasks ?? []) : taskRows);
        const todayIds = new Set((t?.tasks ?? []).map((task: any) => task.id));
        setBacklogTasks((openRows ?? []).filter((task: any) => !todayIds.has(task.id)));
        setSummary(summaryRows);
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

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="info">{notice}</Alert> : null}
      <Card className="space-y-3">
        <div className="page-header">
          <div>
            <h1 className="page-title">{todayLabel}</h1>
            <p className="page-subtitle">{today?.date ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => (window.location.href = "/home")}>
              Дом: {home.name}
            </Button>
            <div className="inline-flex rounded-lg border border-border bg-secondary p-1">
              <Button size="sm" variant={scope === "mine" ? "default" : "ghost"} onClick={() => setScope("mine")}>
                Мои
              </Button>
              <Button size="sm" variant={scope === "all" ? "default" : "ghost"} onClick={() => setScope("all")}>
                Все
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={taskFilter === "overdue" ? "default" : "outline"} onClick={() => setTaskFilter("overdue")}>
            Просроченные
          </Button>
          <Button variant={taskFilter === "today" ? "default" : "outline"} onClick={() => setTaskFilter("today")}>
            Сегодня
          </Button>
          <Button variant={taskFilter === "week" ? "default" : "outline"} onClick={() => setTaskFilter("week")}>
            7 дней
          </Button>
          <Button variant={taskFilter === "noDueDate" ? "default" : "outline"} onClick={() => setTaskFilter("noDueDate")}>
            Без дедлайна
          </Button>
        </div>
        <Button onClick={() => setEditorOpen(true)}>+ Новая задача</Button>
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
            <h2 className="text-base font-semibold">Задачи на сегодня</h2>
            {tasks.length === 0 ? (
              <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">Нет задач — добавьте первую.</p>
                <Button variant="outline" onClick={() => setEditorOpen(true)}>
                  Создать задачу
                </Button>
              </div>
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
            <h2 className="text-base font-semibold">События на сегодня</h2>
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
            <h2 className="text-base font-semibold">Рутины</h2>
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
            <h2 className="text-base font-semibold">Остальные задачи (не на сегодня)</h2>
            {backlogTasks.length === 0 ? (
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
