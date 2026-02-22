"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function TasksPage() {
  const [token, setToken] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
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
    <div className="space-y-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title" />
        <select
          className="h-10 w-full rounded-md border border-border px-3 text-sm"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Без исполнителя</option>
          {(home?.members ?? []).map((member: any) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.firstName || member.user.username || member.user.id}
            </option>
          ))}
        </select>
        <Button
          onClick={async () => {
            if (!title || !token) return;
            try {
              await api.createTask(token, {
                title,
                points: 5,
                assigneeId: assigneeId || undefined
              });
              setTitle("");
              await load(token);
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Create task
        </Button>
      </Card>
      <Card className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка задач...</p>
        ) : tasks.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">Нет задач — добавьте первую</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="space-y-2 rounded border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{task.title}</span>
                <span className="text-xs text-slate-500">{task.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-9 rounded-md border border-border px-2 text-xs"
                  value={task.assigneeId ?? ""}
                  onChange={async (e) => {
                    try {
                      await api.updateTask(token, task.id, { assigneeId: e.target.value || null });
                      await load(token);
                    } catch (err) {
                      setError(getErrorMessage(err));
                    }
                  }}
                >
                  <option value="">Без исполнителя</option>
                  {(home?.members ?? []).map((member: any) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.firstName || member.user.username || member.user.id}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-border px-2 text-xs"
                  value={task.status}
                  onChange={async (e) => {
                    try {
                      await api.updateTask(token, task.id, { status: e.target.value });
                      await load(token);
                    } catch (err) {
                      setError(getErrorMessage(err));
                    }
                  }}
                >
                  <option value="OPEN">OPEN</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            </div>
          ))
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
