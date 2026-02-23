"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, getErrorMessage } from "@/lib/api";
import { getToken } from "@/lib/session";
import { fromInputDateTimeValue, toInputDateTimeValue } from "@/lib/datetime";

function ymd(date: Date) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function EventsPage() {
  const [token, setToken] = useState("");
  const [home, setHome] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load(currentToken: string) {
    const from = ymd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const to = ymd(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const [currentHome, list] = await Promise.all([api.getCurrentHome(currentToken), api.getEvents(currentToken, from, to)]);
    setHome(currentHome);
    setEvents(list);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    load(t).catch((err) => setError(getErrorMessage(err)));
  }, []);

  function toggleParticipant(userId: string) {
    if (participantIds.includes(userId)) {
      setParticipantIds(participantIds.filter((id) => id !== userId));
    } else {
      setParticipantIds([...participantIds, userId]);
    }
  }

  return (
    <div className="page-shell">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className="space-y-3">
        <h1 className="page-title">События</h1>
        <Input placeholder="Название события" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Input type="datetime-local" value={toInputDateTimeValue(startAt) ?? ""} onChange={(e) => setStartAt(fromInputDateTimeValue(e.target.value) ?? "")} />
          <Input type="datetime-local" value={toInputDateTimeValue(endAt) ?? ""} onChange={(e) => setEndAt(fromInputDateTimeValue(e.target.value) ?? "")} />
        </div>
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Участники (опционально)</p>
          {(home?.members ?? []).map((member: any) => (
            <label key={member.user.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={participantIds.includes(member.user.id)}
                onChange={() => toggleParticipant(member.user.id)}
              />
              <span>{member.user.firstName || member.user.username || member.user.id}</span>
            </label>
          ))}
        </div>
        <Button
          onClick={async () => {
            if (!token || !title.trim() || !startAt || !endAt) return;
            try {
              await api.createEvent(token, {
                title: title.trim(),
                description: description.trim() || undefined,
                startAt,
                endAt,
                participantIds
              });
              setTitle("");
              setDescription("");
              setStartAt("");
              setEndAt("");
              setParticipantIds([]);
              await load(token);
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Создать событие
        </Button>
      </Card>
      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Ближайшие события</h2>
        {events.length === 0 ? (
          <p className="empty-state">Событий пока нет.</p>
        ) : (
          events.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`} className="block rounded-lg border border-border p-3">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.startAt).toLocaleString("ru-RU")} - {new Date(event.endAt).toLocaleString("ru-RU")}
              </p>
            </Link>
          ))
        )}
      </Card>
      <BottomNav />
    </div>
  );
}
