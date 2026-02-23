"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskEditorSheet } from "@/components/tasks/task-editor-sheet";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";

export default function EventDetailsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [token, setToken] = useState("");
  const [home, setHome] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState("");

  async function load(currentToken: string) {
    const [currentHome, eventData] = await Promise.all([api.getCurrentHome(currentToken), api.getEvent(currentToken, eventId)]);
    setHome(currentHome);
    setEvent(eventData);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t || !eventId) return;
    load(t).catch((err) => setError(getErrorMessage(err)));
  }, [eventId]);

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-2">
        <h1 className="page-title">{event?.title ?? "Событие"}</h1>
        <p className="text-sm text-muted-foreground">{event?.description || "Без описания"}</p>
        <p className="text-xs text-muted-foreground">
          {event?.startAt ? new Date(event.startAt).toLocaleString("ru-RU") : "—"} -{" "}
          {event?.endAt ? new Date(event.endAt).toLocaleString("ru-RU") : "—"}
        </p>
      </Card>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Задачи события</h2>
          <Button size="sm" onClick={() => setEditorOpen(true)}>
            + Задача
          </Button>
        </div>
        {(event?.tasks ?? []).length === 0 ? (
          <p className="empty-state">К событию пока не привязано задач.</p>
        ) : (
          (event?.tasks ?? []).map((task: any) => (
            <TaskCard
              key={task.id}
              task={task}
              members={home?.members ?? []}
              timezone={home?.timezone ?? "UTC"}
              onDone={async (id) => {
                await api.doneTask(token, id);
                await load(token);
              }}
              onUpdate={async (id, payload) => {
                await api.updateTask(token, id, payload);
                await load(token);
              }}
            />
          ))
        )}
      </Card>
      <TaskEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        members={home?.members ?? []}
        onSave={async (payload) => {
          await api.createTask(token, {
            title: payload.title,
            assigneeIds: payload.assigneeIds ?? undefined,
            dueDate: payload.dueDate ?? undefined,
            eventId,
            points: 5
          });
          await load(token);
        }}
      />
      <BottomNav />
    </div>
  );
}
