"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";

type Suggestion = {
  id: string;
  type: "TASK" | "EVENT" | "QUESTION";
  title: string;
  description: string | null;
  confidence: number | null;
  proposedAssigneeMode: "SINGLE" | "ALL" | "UNASSIGNED" | null;
  proposedDueAt: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  sourceMessageRefs: Array<{ telegramChatId: string; telegramMessageId: number }> | null;
  createdAt: string;
};

export default function AiInboxPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [summaryStats, setSummaryStats] = useState<{ tasks: number; routines: number; events: number; aiSuggestions: number } | null>(null);

  async function load(currentToken: string) {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([
        api.getAiSuggestions(currentToken, { status: "pending", limit: 50 }),
        api.getAiTodaySummary(currentToken)
      ]);
      setSuggestions(list.rows ?? []);
      setSummaryText(summary.summaryText ?? "");
      setSummaryStats(summary.stats ?? null);
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
    if (!t) {
      setLoading(false);
      return;
    }
    load(t);
  }, []);

  async function updateStatus(id: string, action: "approve" | "reject" | "ignore") {
    if (!token) return;
    try {
      if (action === "approve") {
        await api.approveAiSuggestion(token, id);
      } else if (action === "reject") {
        await api.rejectAiSuggestion(token, id);
      } else {
        await api.ignoreAiSuggestion(token, id);
      }
      setNotice("Статус обновлен.");
      await load(token);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      <Card className="space-y-2">
        <h1 className="page-title">AI Inbox</h1>
        <p className="text-sm text-muted-foreground">{summaryText || "Кандидаты из семейного чата (безопасный режим)."}</p>
        {summaryStats ? (
          <p className="text-xs text-muted-foreground">
            Сегодня: задачи {summaryStats.tasks}, рутины {summaryStats.routines}, события {summaryStats.events}, AI {summaryStats.aiSuggestions}
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => token && load(token)}>
          Обновить
        </Button>
      </Card>
      <Card className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="empty-state">Пока нет ожидающих AI-кандидатов.</p>
        ) : (
          suggestions.map((item) => {
            const confidence = item.confidence !== null ? `${Math.round(item.confidence * 100)}%` : "—";
            const refsCount = item.sourceMessageRefs?.length ?? 0;
            return (
              <div key={item.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{item.type.toLowerCase()}</Badge>
                  <span className="text-xs text-muted-foreground">Уверенность: {confidence}</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p> : null}
                <div className="text-xs text-muted-foreground">
                  <p>Исполнитель: {item.proposedAssigneeMode?.toLowerCase() ?? "не назначен"}</p>
                  <p>
                    Время: {item.proposedDueAt ?? item.proposedStartAt ?? "—"}
                    {item.proposedEndAt ? ` → ${item.proposedEndAt}` : ""}
                  </p>
                  <p>Источники: {refsCount} сообщений</p>
                  <p>Создано: {new Date(item.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" onClick={() => updateStatus(item.id, "approve")}>
                    ✅ Подтвердить
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(item.id, "reject")}>
                    ❌ Отклонить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(item.id, "ignore")}>
                    ⏳ Игнорировать
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
