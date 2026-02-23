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
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-2">
        <h1 className="page-title">Дом</h1>
        <p className="text-sm text-foreground">{home?.name || "Дом не выбран"}</p>
        <p className="text-sm text-muted-foreground">Часовой пояс: {home?.timezone || "—"}</p>
        <p className="text-sm text-muted-foreground">Чат-группа: {home?.chatLinks?.length ? "Привязана" : "Сделайте /link в семейной группе"}</p>
        <p className="text-xs text-muted-foreground">
          Чтобы бот отправлял дайджесты в чат, откройте нужную группу и выполните команду `/link`.
        </p>
      </Card>
      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Участники</h2>
        {(home?.members ?? []).length === 0 ? (
          <p className="empty-state">Участников пока нет</p>
        ) : (
          (home?.members ?? []).map((member: any) => (
            <div key={member.id} className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
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
          Создать инвайт
        </Button>
        {invite?.code ? <p className="text-sm text-foreground">Invite code: {invite.code}</p> : null}
      </Card>
      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Таблица очков</h2>
        {scoreboard.length === 0 ? (
          <p className="empty-state">Пока нет данных по очкам.</p>
        ) : (
          scoreboard.map((row) => (
            <div key={row.userId} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              <span className="text-foreground">{row.name || row.userId}</span>
              <span className="font-semibold text-foreground">{row.points}</span>
            </div>
          ))
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
