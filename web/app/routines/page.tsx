"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const weekDays = [
  { label: "Вс", value: 0 },
  { label: "Пн", value: 1 },
  { label: "Вт", value: 2 },
  { label: "Ср", value: 3 },
  { label: "Чт", value: 4 },
  { label: "Пт", value: 5 },
  { label: "Сб", value: 6 }
];

export default function RoutinesPage() {
  const [token, setToken] = useState("");
  const [title, setTitle] = useState("");
  const [routines, setRoutines] = useState<any[]>([]);
  const [home, setHome] = useState<any>(null);
  const [scheduleType, setScheduleType] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [assigneeMode, setAssigneeMode] = useState<"ROTATE" | "FIXED">("ROTATE");
  const [fixedAssigneeId, setFixedAssigneeId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(currentToken: string) {
    setLoading(true);
    try {
      const [list, currentHome] = await Promise.all([api.getRoutines(currentToken), api.getCurrentHome(currentToken)]);
      setRoutines(list);
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

  function toggleDay(value: number) {
    setDaysOfWeek((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value].sort()));
  }

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <h1 className="page-title">Рутины</h1>
        <div className="space-y-1.5">
          <p className="field-label">Название рутины</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: вечерняя уборка" />
        </div>
        <Tabs value={scheduleType} onValueChange={(value) => setScheduleType(value as "DAILY" | "WEEKLY")}>
          <TabsList columns={2}>
            <TabsTrigger value="DAILY">Каждый день</TabsTrigger>
            <TabsTrigger value="WEEKLY">По дням недели</TabsTrigger>
          </TabsList>
        </Tabs>
        {scheduleType === "WEEKLY" ? (
          <div className="flex flex-wrap gap-2">
            {weekDays.map((day) => (
              <Button
                key={day.value}
                size="sm"
                variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                onClick={() => toggleDay(day.value)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        ) : null}
        <Tabs value={assigneeMode} onValueChange={(value) => setAssigneeMode(value as "ROTATE" | "FIXED")}>
          <TabsList columns={2}>
            <TabsTrigger value="ROTATE">По очереди</TabsTrigger>
            <TabsTrigger value="FIXED">Фиксированный</TabsTrigger>
          </TabsList>
        </Tabs>
        {assigneeMode === "FIXED" ? (
          <select
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={fixedAssigneeId}
            onChange={(e) => setFixedAssigneeId(e.target.value)}
          >
            <option value="">Выберите исполнителя</option>
            {(home?.members ?? []).map((member: any) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.firstName || member.user.username || member.user.id}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          onClick={async () => {
            if (!token || !title) return;
            try {
              await api.createRoutine(token, {
                title,
                scheduleType,
                daysOfWeek: scheduleType === "WEEKLY" ? daysOfWeek : [],
                assigneeMode,
                fixedAssigneeId: assigneeMode === "FIXED" ? fixedAssigneeId : undefined,
                points: 3
              });
              setTitle("");
              setDaysOfWeek([]);
              setFixedAssigneeId("");
              await load(token);
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Создать рутину
        </Button>
      </Card>
      <Card className="space-y-2">
        <h2 className="section-title">Список рутин</h2>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : routines.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Нет рутин — добавьте первую.</p>
            <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              Создать рутину
            </Button>
          </div>
        ) : (
          routines.map((routine) => (
            <div key={routine.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{routine.title}</p>
                  <Badge variant={routine.isActive ? "success" : "outline"} className="gap-1">
                    <StatusIndicator kind={routine.isActive ? "enabled" : "disabled"} />
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {routine.scheduleType}
                  {routine.scheduleType === "WEEKLY" ? ` (${(routine.daysOfWeek ?? []).join(",")})` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await api.toggleRoutine(token, routine.id);
                    await load(token);
                  } catch (err) {
                    setError(getErrorMessage(err));
                  }
                }}
              >
                <StatusIndicator kind={routine.isActive ? "enabled" : "disabled"} />
                {routine.isActive ? "Отключить" : "Включить"}
              </Button>
            </div>
          ))
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
