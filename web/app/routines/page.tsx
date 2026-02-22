"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function RoutinesPage() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [routines, setRoutines] = useState<any[]>([]);

  async function load(currentToken: string) {
    const list = await api.getRoutines(currentToken);
    setRoutines(list);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (t) load(t);
  }, []);

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Routines</h1>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New routine title" />
        <Button
          onClick={async () => {
            if (!token || !title) return;
            await api.createRoutine(token, {
              title,
              scheduleType: "DAILY",
              assigneeMode: "ROTATE",
              points: 3
            });
            setTitle("");
            await load(token);
          }}
        >
          Create routine
        </Button>
      </Card>
      <Card className="space-y-2">
        {routines.map((routine) => (
          <div key={routine.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{routine.title}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await api.toggleRoutine(token, routine.id);
                await load(token);
              }}
            >
              {routine.isActive ? "Disable" : "Enable"}
            </Button>
          </div>
        ))}
      </Card>
      <BottomNav />
    </div>
  );
}
