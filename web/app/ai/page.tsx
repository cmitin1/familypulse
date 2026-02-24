"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, X } from "lucide-react";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api";
import { fromInputDateTimeValue, toInputDateTimeValue } from "@/lib/datetime";
import { getToken } from "@/lib/session";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StateBlock } from "@/components/ui/state-block";

type Suggestion = {
  id: string;
  type: "TASK" | "EVENT" | "QUESTION";
  title: string;
  description: string | null;
  confidence: number | null;
  proposedAssigneeMode: "SINGLE" | "ALL" | "UNASSIGNED" | null;
  proposedAssigneeUserIds: string[] | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [memberNamesById, setMemberNamesById] = useState<Record<string, string>>({});
  const [dueDraftById, setDueDraftById] = useState<Record<string, string>>({});
  const [statusTab, setStatusTab] = useState<"pending" | "approved" | "ignored">("pending");

  async function load(currentToken: string) {
    setLoading(true);
    try {
      const [list, summary, home] = await Promise.all([
        api.getAiSuggestions(currentToken, { status: statusTab, limit: 50 }),
        api.getAiTodaySummary(currentToken),
        api.getCurrentHome(currentToken)
      ]);
      setSuggestions(list.rows ?? []);
      const drafts: Record<string, string> = {};
      for (const row of list.rows ?? []) {
        drafts[row.id] = toInputDateTimeValue(row.proposedDueAt ?? "");
      }
      setDueDraftById((prev) => ({ ...prev, ...drafts }));
      setSummaryText(summary.summaryText ?? "");
      setSummaryStats(summary.stats ?? null);
      const map: Record<string, string> = {};
      for (const member of home?.members ?? []) {
        const user = member?.user;
        if (user?.id) {
          map[user.id] = user.firstName || user.username || user.id;
        }
      }
      setMemberNamesById(map);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function renderAssignee(item: Suggestion): string {
    const ids = Array.isArray(item.proposedAssigneeUserIds) ? item.proposedAssigneeUserIds : [];
    const names = ids.map((id) => memberNamesById[id] ?? id).filter(Boolean);
    if (item.proposedAssigneeMode === "ALL") {
      return names.length ? `Все: ${names.join(", ")}` : "Все участники";
    }
    if (item.proposedAssigneeMode === "SINGLE") {
      return names[0] ?? "Назначить вручную";
    }
    return "Назначить вручную";
  }

  function renderTime(item: Suggestion): string {
    if (item.proposedDueAt) {
      return `Срок: ${new Date(item.proposedDueAt).toLocaleString("ru-RU")}`;
    }
    if (item.proposedStartAt) {
      const start = new Date(item.proposedStartAt).toLocaleString("ru-RU");
      const end = item.proposedEndAt ? new Date(item.proposedEndAt).toLocaleString("ru-RU") : null;
      return end ? `Время: ${start} → ${end}` : `Время: ${start}`;
    }
    return "Срок: назначить вручную";
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    load(t);
  }, [statusTab]);

  async function updateStatus(id: string, action: "approve" | "reject" | "ignore") {
    if (!token) return;
    try {
      if (action === "approve") {
        const item = suggestions.find((s) => s.id === id);
        const dueDraft = dueDraftById[id] ?? "";
        await api.approveAiSuggestion(token, id, {
          dueDate: item?.type === "TASK" ? (dueDraft ? fromInputDateTimeValue(dueDraft) : null) : undefined
        });
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

  async function refreshInbox() {
    if (!token || refreshing) return;
    setRefreshing(true);
    setNotice("");
    try {
      const result = await api.refreshAiSuggestions(token);
      await load(token);
      if (result.status === "no_new_messages") {
        setNotice("Новых сообщений для анализа не найдено.");
      } else {
        setNotice(
          `AI анализ завершен: обработано чатов ${result.processedChats ?? 0}, сообщений ${result.messagesAnalyzed ?? 0}, кандидатов ${result.suggestionsCreated ?? 0}.`
        );
      }
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  function confidenceLabel(confidence: number | null) {
    if (confidence === null) return "Нужна проверка";
    if (confidence >= 0.75) return "Высокая уверенность";
    if (confidence >= 0.5) return "Средняя уверенность";
    return "Низкая уверенность";
  }

  function confidenceVariant(confidence: number | null): "outline" | "success" | "warning" {
    if (confidence === null) return "outline";
    if (confidence >= 0.75) return "success";
    return "warning";
  }

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title">AI Inbox</h1>
          <Badge variant="ai">Проверка человеком</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{summaryText || "Кандидаты из семейного чата (безопасный режим)."}</p>
        <p className="helper-text">AI предлагает кандидатов, а финальное решение всегда принимает участник семьи.</p>
        {summaryStats ? (
          <p className="text-xs text-muted-foreground">
            Сегодня: задачи {summaryStats.tasks ?? 0}, рутины {summaryStats.routines ?? 0}, события {summaryStats.events ?? 0}, AI{" "}
            {summaryStats.aiSuggestions ?? 0}
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={refreshInbox} disabled={!token || refreshing || loading}>
          {refreshing ? "Анализируем чат..." : "Обновить"}
        </Button>
      </Card>
      <Card className="space-y-2" density="compact">
        <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as "pending" | "approved" | "ignored")}>
          <TabsList columns={3}>
            <TabsTrigger value="pending">Ожидают</TabsTrigger>
            <TabsTrigger value="approved">Подтверждены</TabsTrigger>
            <TabsTrigger value="ignored">Игнор</TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>
      <Card className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : suggestions.length === 0 ? (
          statusTab === "pending" ? (
            <StateBlock message="Пока нет ожидающих AI-кандидатов." actionLabel="Обновить" onAction={refreshInbox} />
          ) : (
            <p className="empty-state">
              {statusTab === "approved" ? "Подтвержденных AI-кандидатов пока нет." : "Игнорированных AI-кандидатов пока нет."}
            </p>
          )
        ) : (
          suggestions.map((item) => {
            const confidence = item.confidence !== null ? `${Math.round(item.confidence * 100)}%` : "—";
            const refsCount = item.sourceMessageRefs?.length ?? 0;
            const canReview = statusTab === "pending";
            return (
              <div key={item.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="ai">AI</Badge>
                    <Badge variant="outline">{item.type.toLowerCase()}</Badge>
                  </div>
                  <Badge variant={confidenceVariant(item.confidence)}>{confidence}</Badge>
                </div>
                <p className="helper-text">{confidenceLabel(item.confidence)}</p>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p> : null}
                <div className="ai-card text-xs">
                  <p>Исполнитель: {renderAssignee(item)}</p>
                  <p>{renderTime(item)}</p>
                  <p>Источники: {refsCount} сообщений из чата</p>
                  <p>Создано: {new Date(item.createdAt).toLocaleString("ru-RU")}</p>
                </div>
                {item.type === "TASK" && canReview ? (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Срок перед подтверждением</label>
                    <input
                      type="datetime-local"
                      value={dueDraftById[item.id] ?? ""}
                      onChange={(e) =>
                        setDueDraftById((prev) => ({
                          ...prev,
                          [item.id]: e.target.value
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Можно оставить пустым — задача создастся без дедлайна.
                    </p>
                  </div>
                ) : null}
                {canReview ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" onClick={() => updateStatus(item.id, "approve")}>
                      <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Подтвердить
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(item.id, "reject")}>
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Отклонить
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(item.id, "ignore")}>
                      <Clock3 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Игнорировать
                    </Button>
                  </div>
                ) : (
                  <p className="helper-text">Карточка в архивном статусе. Действия недоступны.</p>
                )}
              </div>
            );
          })
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
