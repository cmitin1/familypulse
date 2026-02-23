"use client";

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
  const [today, setToday] = useState<any>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [joinCode, setJoinCode] = useState("");
  const [homeName, setHomeName] = useState("Наш дом");
  const [notice, setNotice] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
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

    const existing = getToken();
    if (existing) {
      setTokenState(existing);
      setStatus("OK");
      return;
    }

    waitForInitData()
      .then((initData) => {
        if (!initData) {
          setStatus(tg ? "Не получили initData. Откройте Mini App через бота." : "Откройте страницу из Telegram Mini App");
          setIsLoading(false);
          return;
        }
        return api
          .authTelegram(initData)
          .then((resp) => {
            setToken(resp.token);
            setTokenState(resp.token);
            setStatus("OK");
          })
          .catch((err) => {
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
    withReAuth((actualToken) =>
      Promise.all([
        api.getCurrentHome(actualToken),
        api.getToday(actualToken, scope),
        api.getTasks(actualToken, tasksQuery),
        api.getTasksSummaryByAssignee(actualToken, from, to)
      ])
    )
      .then(([h, t, taskRows, summaryRows]) => {
        setHome(h);
        setToday(t);
        setTasks(taskRows);
        setSummary(summaryRows);
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
      const [h, t, taskRows, summaryRows] = await withReAuth((actualToken) =>
        Promise.all([
          api.getCurrentHome(actualToken),
          api.getToday(actualToken, scope),
          api.getTasks(actualToken, tasksQuery),
          api.getTasksSummaryByAssignee(actualToken, from, to)
        ])
      );
      setHome(h);
      setToday(t);
      setTasks(taskRows);
      setSummary(summaryRows);
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
        <h1 className="text-lg font-semibold">FamilyPulse</h1>
        <p className="text-sm text-slate-600">{status}</p>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </Card>
    );
  }

  if (!home?.id) {
    return (
      <div className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Card className="space-y-3">
          <h1 className="text-lg font-semibold">Добро пожаловать в FamilyPulse</h1>
          <p className="text-sm text-slate-600">Создайте дом или присоединитесь по инвайт-коду.</p>
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
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" />
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
      </div>
    );
  }

  const done = today?.doneCount ?? 0;
  const total = today?.totalCount ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="info">{notice}</Alert> : null}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Сегодня</h1>
          <div className="inline-flex rounded-md border border-border bg-white p-1">
            <Button size="sm" variant={scope === "mine" ? "default" : "outline"} onClick={() => setScope("mine")}>
              Мои
            </Button>
            <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>
              Все
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          {home.name} • {today?.date ?? "—"}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-2">Прогресс: {done}/{total}</div>
          <div className="rounded-md bg-slate-50 p-2">Выполнено: {progress}%</div>
          <div className="rounded-md bg-slate-50 p-2">Очки сегодня: {today?.pointsToday ?? 0}</div>
          <div className="rounded-md bg-slate-50 p-2">Стрик: {today?.streakClosed ? "закрыт" : "открыт"}</div>
        </div>
        <Button
          variant="outline"
          onClick={() => setNotice("Экспорт в чат будет добавлен в следующем небольшом обновлении.")}
        >
          Share Today to chat
        </Button>
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
        <Button onClick={() => setEditorOpen(true)}>+ Быстро добавить задачу</Button>
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
            <h2 className="font-medium">Задачи ({taskFilter})</h2>
            {tasks.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">Нет задач — добавьте первую</p>
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
                  onReassign={async (id, assignee) => {
                    await api.updateTask(token, id, { assigneeId: assignee });
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

          <TasksSummaryTable
            rows={summary}
            tasks={tasks}
            members={home?.members ?? []}
            timezone={home?.timezone ?? "UTC"}
            onDone={async (id) => {
              await api.doneTask(token, id);
              await reload();
            }}
            onReassign={async (id, assigneeId) => {
              await api.updateTask(token, id, { assigneeId });
              await reload();
            }}
            onUpdate={async (id, payload) => {
              await api.updateTask(token, id, payload);
              await reload();
            }}
          />

          <Card className="space-y-2 border-sky-200 bg-sky-50/50">
            <h2 className="font-medium text-sky-900">Routines</h2>
            {(today?.routineInstances ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-sky-200 p-3 text-sm text-sky-700">
                Нет рутин на сегодня — добавьте первую
              </p>
            ) : (
              (today?.routineInstances ?? []).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border bg-white p-3 text-sm">
                  <div>
                    <p className="font-medium">{item.routine.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.assignee?.firstName || item.assignee?.username || "Без исполнителя"}
                    </p>
                  </div>
                  {item.isDone ? (
                    <Badge variant="success">done</Badge>
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
                      done
                    </Button>
                  )}
                </div>
              ))
            )}
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
            assigneeId: payload.assigneeId ?? undefined,
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
