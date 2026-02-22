"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getToken, setToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/nav";

declare global {
  interface Window {
    Telegram?: any;
  }
}

export default function TodayPage() {
  const [token, setTokenState] = useState("");
  const [status, setStatus] = useState("Инициализация...");
  const [home, setHome] = useState<any>(null);
  const [today, setToday] = useState<any>(null);
  const [joinCode, setJoinCode] = useState("");
  const [homeName, setHomeName] = useState("My Home");

  useEffect(() => {
    const existing = getToken();
    if (existing) {
      setTokenState(existing);
      return;
    }

    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setStatus("Нет initData. Откройте страницу из Telegram Mini App.");
      return;
    }
    api
      .authTelegram(initData)
      .then((resp) => {
        setToken(resp.token);
        setTokenState(resp.token);
      })
      .catch(() => setStatus("Ошибка авторизации Telegram"));
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.getCurrentHome(token), api.getToday(token, "mine")])
      .then(([h, t]) => {
        setHome(h);
        setToday(t);
        setStatus("OK");
      })
      .catch(() => setStatus("Не удалось загрузить данные"));
  }, [token]);

  async function reload() {
    if (!token) return;
    const [h, t] = await Promise.all([api.getCurrentHome(token), api.getToday(token, "mine")]);
    setHome(h);
    setToday(t);
  }

  if (!token) {
    return <Card>{status}</Card>;
  }

  if (!home?.id) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3">
          <h1 className="text-lg font-semibold">Onboarding</h1>
          <Input value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="Название дома" />
          <Button
            onClick={async () => {
              await api.createHome(token, homeName, "Europe/Moscow");
              await reload();
            }}
          >
            Create Home
          </Button>
        </Card>
        <Card className="space-y-3">
          <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" />
          <Button
            variant="outline"
            onClick={async () => {
              await api.joinInvite(token, joinCode);
              await reload();
            }}
          >
            Join by code
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <h1 className="text-lg font-semibold">Today</h1>
        <p className="text-sm text-slate-600">{home.name}</p>
        <p className="text-sm">Streak closed: {today?.streakClosed ? "yes" : "no"}</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Tasks</h2>
        {(today?.tasks ?? []).map((task: any) => (
          <div key={task.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{task.title}</span>
            {task.status === "DONE" ? (
              <span>done</span>
            ) : (
              <Button size="sm" onClick={async () => { await api.doneTask(token, task.id); await reload(); }}>
                done
              </Button>
            )}
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Routines</h2>
        {(today?.routineInstances ?? []).map((item: any) => (
          <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{item.routine.title}</span>
            {item.isDone ? (
              <span>done</span>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  await api.doneRoutineInstance(token, item.id);
                  await reload();
                }}
              >
                done
              </Button>
            )}
          </div>
        ))}
      </Card>
      <BottomNav />
    </div>
  );
}
