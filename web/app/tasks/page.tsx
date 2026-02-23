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

export default function TasksPage() {
  const [token, setToken] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(currentToken: string) {
    setLoading(true);
    try {
      const [list, currentHome] = await Promise.all([api.getTasks(currentToken, "all"), api.getCurrentHome(currentToken)]);
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
  }, []);

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Задачи</h1>
          <Button onClick={() => setEditorOpen(true)}>Новая задача</Button>
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
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Нет задач — добавьте первую.</p>
            <Button variant="outline" onClick={() => setEditorOpen(true)}>
              Создать задачу
            </Button>
          </div>
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
              onReassign={async (id, assignee) => {
                try {
                  await api.updateTask(token, id, { assigneeId: assignee });
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
            assigneeId: payload.assigneeId ?? undefined,
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
