"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";
import { TaskEditorSheet } from "@/components/tasks/task-editor-sheet";
import { TaskCard } from "@/components/tasks/task-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBlock } from "@/components/ui/state-block";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TasksPage() {
  const [token, setToken] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(currentToken: string) {
    setLoading(true);
    try {
      const [list, currentHome] = await Promise.all([
        api.getTasks(currentToken, { scope, status: statusFilter }),
        api.getCurrentHome(currentToken)
      ]);
      setTasks(list);
      setHome(currentHome);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (t) load(t);
    else setLoading(false);
  }, [scope, statusFilter]);

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Задачи</h1>
          <Button onClick={() => setEditorOpen(true)}>Новая задача</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs value={scope} onValueChange={(value) => setScope(value as "mine" | "all")} className="w-[132px]">
            <TabsList columns={2}>
              <TabsTrigger value="mine">Мои</TabsTrigger>
              <TabsTrigger value="all">Все</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as "open" | "done" | "all")} className="flex-1 min-w-[210px]">
            <TabsList columns={3}>
              <TabsTrigger value="open">Открытые</TabsTrigger>
              <TabsTrigger value="done">Выполненные</TabsTrigger>
              <TabsTrigger value="all">Все</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>
      <Card className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <StateBlock
            message="По текущему фильтру задач нет. Можно создать задачу или проверить AI Inbox."
            actionLabel="Создать задачу"
            onAction={() => setEditorOpen(true)}
          />
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              members={home?.members ?? []}
              timezone={home?.timezone ?? "UTC"}
              onDone={async (id) => {
                try {
                  await api.doneTask(token, id);
                  await load(token);
                } catch (err) {
                  setError(getErrorMessage(err));
                }
              }}
              onUpdate={async (id, payload) => {
                try {
                  await api.updateTask(token, id, payload);
                  await load(token);
                } catch (err) {
                  setError(getErrorMessage(err));
                }
              }}
            />
          ))
        )}
      </Card>
      <TaskEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        members={home?.members ?? []}
        onSave={async (payload) => {
          if (!token) return;
          await api.createTask(token, {
            title: payload.title,
            assigneeIds: payload.assigneeIds ?? undefined,
            dueDate: payload.dueDate ?? undefined,
            points: 5
          });
          await load(token);
        }}
      />
      <BottomNav />
    </div>
  );
}
