"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function TasksPage() {
  const [token, setToken] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState("");

  async function load(currentToken: string) {
    const list = await api.getTasks(currentToken, "all");
    setTasks(list);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (t) load(t);
  }, []);

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task title" />
        <Button
          onClick={async () => {
            if (!title || !token) return;
            await api.createTask(token, { title, points: 5 });
            setTitle("");
            await load(token);
          }}
        >
          Create task
        </Button>
      </Card>
      <Card className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{task.title}</span>
            <span>{task.status}</span>
          </div>
        ))}
      </Card>
      <BottomNav />
    </div>
  );
}
