"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, getErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { getToken } from "@/lib/session";

function ymd(date: Date) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthDays(reference: Date) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let d = 1; d <= end.getDate(); d += 1) {
    days.push(new Date(reference.getFullYear(), reference.getMonth(), d));
  }
  const firstWeekdayMondayBased = (start.getDay() + 6) % 7;
  return { start, end, days, firstWeekdayMondayBased };
}

export default function CalendarPage() {
  const [token, setToken] = useState("");
  const [home, setHome] = useState<any>(null);
  const [feeds, setFeeds] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tasksDue, setTasksDue] = useState<any[]>([]);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthCursor, setMonthCursor] = useState(new Date());

  const monthMeta = useMemo(() => monthDays(monthCursor), [monthCursor]);

  async function load(currentToken: string) {
    const from = ymd(monthMeta.start);
    const to = ymd(monthMeta.end);
    const [homeData, feedsData, calendarData] = await Promise.all([
      api.getCurrentHome(currentToken),
      api.getCalendarFeeds(currentToken),
      api.getCalendarEvents(currentToken, from, to, true)
    ]);
    setHome(homeData);
    setFeeds(feedsData);
    setEvents(calendarData.events ?? []);
    setTasksDue(calendarData.tasksDue ?? []);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    load(t).catch((err) => setError(getErrorMessage(err)));
  }, [monthMeta.start.getTime(), monthMeta.end.getTime()]);

  const selectedYmd = ymd(selectedDate);
  const dayEvents = events.filter((event) => ymd(new Date(event.startAt)) === selectedYmd);
  const dayTasks = tasksDue.filter((task) => task.dueDate && ymd(new Date(task.dueDate)) === selectedYmd);

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Календарь</h1>
          <Badge variant="outline">{home?.timezone || "UTC"}</Badge>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "month" | "agenda")}>
          <TabsList>
            <TabsTrigger value="month">Месяц</TabsTrigger>
            <TabsTrigger value="agenda">Повестка</TabsTrigger>
          </TabsList>
          <TabsContent value="month">
            <div className="flex items-center justify-between pb-2">
              <Button variant="outline" size="sm" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>
                ←
              </Button>
              <p className="text-sm font-medium">
                {new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(monthCursor)}
              </p>
              <Button variant="outline" size="sm" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>
                →
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: monthMeta.firstWeekdayMondayBased }).map((_, index) => (
                <div key={`empty-${index}`} className="h-[58px] rounded-md border border-transparent" />
              ))}
              {monthMeta.days.map((day) => {
                const key = ymd(day);
                const count = events.filter((event) => ymd(new Date(event.startAt)) === key).length;
                const taskCount = tasksDue.filter((task) => task.dueDate && ymd(new Date(task.dueDate)) === key).length;
                return (
                  <button
                    type="button"
                    key={key}
                    className={`rounded-lg border p-2 text-left ${key === selectedYmd ? "border-primary bg-secondary" : "border-border bg-card"}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <p className="text-xs font-medium">{day.getDate()}</p>
                    <p className="text-[10px] text-muted-foreground">E:{count} T:{taskCount}</p>
                  </button>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="agenda">
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="empty-state">Нет событий в выбранном диапазоне.</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.startAt, home?.timezone || "UTC")}</p>
                    <p className="text-xs text-muted-foreground">{event.feed?.title}</p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">На дату: {selectedYmd}</h2>
        <p className="text-xs text-muted-foreground">События и задачи с дедлайном</p>
        <Separator />
        {dayEvents.map((event) => (
          <div key={event.id} className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{event.title}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.startAt, home?.timezone || "UTC")}</p>
          </div>
        ))}
        {dayTasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground">Задача с дедлайном</p>
          </div>
        ))}
        {dayEvents.length === 0 && dayTasks.length === 0 ? (
          <p className="empty-state">Пусто на выбранную дату.</p>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Подключить календарь (ICS)</h2>
        <Input placeholder="Название feed" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="https://...ics" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} />
        <Button
          onClick={async () => {
            if (!token || !title.trim() || !icsUrl.trim()) return;
            try {
              await api.createCalendarFeed(token, { title: title.trim(), icsUrl: icsUrl.trim() });
              setTitle("");
              setIcsUrl("");
              await load(token);
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Подключить календарь
        </Button>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Feeds</h2>
        {feeds.length === 0 ? (
          <p className="empty-state">Пока нет подключенных календарей.</p>
        ) : (
          feeds.map((feed) => (
            <div key={feed.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{feed.title}</p>
                <Badge variant={feed.isEnabled ? "success" : "outline"}>{feed.isEnabled ? "enabled" : "disabled"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground break-all">{feed.icsUrl}</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!token) return;
                    await api.updateCalendarFeed(token, feed.id, { isEnabled: !feed.isEnabled });
                    await load(token);
                  }}
                >
                  {feed.isEnabled ? "Отключить" : "Включить"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!token) return;
                    await api.syncCalendarFeed(token, feed.id);
                    await load(token);
                  }}
                >
                  Синхр.
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!token) return;
                    await api.deleteCalendarFeed(token, feed.id);
                    await load(token);
                  }}
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
