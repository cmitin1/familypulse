"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function HomePage() {
  const [token, setToken] = useState("");
  const [home, setHome] = useState<any>(null);
  const [invite, setInvite] = useState<any>(null);
  const [scoreboard, setScoreboard] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    Promise.all([api.getCurrentHome(t), api.getScoreboard(t)])
      .then(([h, s]) => {
        setHome(h);
        setScoreboard(s);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-2">
        <h1 className="text-lg font-semibold">Home</h1>
        <p className="text-sm">{home?.name || "Дом не выбран"}</p>
        <p className="text-sm text-slate-600">Timezone: {home?.timezone || "—"}</p>
        <p className="text-sm text-slate-600">
          Group link: {home?.chatLinks?.length ? "Привязано" : "Сделайте /link в семейной группе"}
        </p>
        <p className="text-xs text-slate-500">
          Чтобы бот отправлял дайджесты в чат, откройте нужную группу и выполните команду `/link`.
        </p>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Members</h2>
        {(home?.members ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Участников пока нет</p>
        ) : (
          (home?.members ?? []).map((member: any) => (
            <div key={member.id} className="rounded border p-2 text-sm">
              {member.user.firstName || member.user.username} ({member.role})
            </div>
          ))
        )}
      </Card>
      <Card className="space-y-2">
        <Button
          onClick={async () => {
            if (!token) return;
            try {
              const inv = await api.createInvite(token);
              setInvite(inv);
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Create invite
        </Button>
        {invite?.code ? <p className="text-sm">Invite code: {invite.code}</p> : null}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-medium">Scoreboard</h2>
        {scoreboard.map((row) => (
          <div key={row.userId} className="flex justify-between text-sm">
            <span>{row.name || row.userId}</span>
            <span>{row.points}</span>
          </div>
        ))}
      </Card>
      <BottomNav />
    </div>
  );
}
