"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, daysUntilDue } from "@/lib/datetime";
import { TaskEditorSheet } from "@/components/tasks/task-editor-sheet";

type Member = {
  user: { id: string; firstName?: string | null; username?: string | null };
};

type Task = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  dueDate?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; firstName?: string | null; username?: string | null } | null;
};

function dueBadgeVariant(diff: number | null) {
  if (diff === null) return "outline";
  if (diff < 0) return "danger";
  if (diff <= 2) return "warning";
  return "default";
}

function dueText(diff: number | null) {
  if (diff === null) return "Без дедлайна";
  if (diff < 0) return `Просрочено на ${Math.abs(diff)} дн.`;
  if (diff === 0) return "Сегодня дедлайн";
  return `Осталось ${diff} дн.`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function TaskCard({
  task,
  members,
  timezone,
  onDone,
  onReassign,
  onUpdate
}: {
  task: Task;
  members: Member[];
  timezone: string;
  onDone: (id: string) => Promise<void>;
  onReassign: (id: string, assigneeId: string | null) => Promise<void>;
  onUpdate: (id: string, payload: { title?: string; assigneeId?: string | null; dueDate?: string | null; status?: "OPEN" | "DONE" }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const diff = daysUntilDue(task.dueDate, timezone);
  const assigneeName = task.assignee?.firstName || task.assignee?.username || "Без исполнителя";
  const initials = getInitials(assigneeName);
  const isDone = task.status === "DONE";

  return (
    <Card className="space-y-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
            <p className="text-xs text-muted-foreground">{assigneeName}</p>
          </div>
        </div>
        <Badge variant={isDone ? "success" : "outline"}>{isDone ? "выполнена" : "открыта"}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={dueBadgeVariant(diff)}>{dueText(diff)}</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(task.dueDate ?? null, timezone)}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button size="sm" variant="outline" disabled={isDone} onClick={() => onDone(task.id)}>
          Выполнено
        </Button>
        <select
          className="h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={task.assigneeId ?? ""}
          onChange={(e) => onReassign(task.id, e.target.value || null)}
        >
          <option value="">Без исп.</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.firstName || member.user.username || member.user.id}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setEditing(true)}>
          Редактировать
        </Button>
      </div>
      <TaskEditorSheet
        open={editing}
        onOpenChange={setEditing}
        members={members}
        initial={{
          title: task.title,
          assigneeId: task.assigneeId ?? "",
          dueDate: task.dueDate ?? null,
          status: task.status
        }}
        onSave={async (payload) => {
          await onUpdate(task.id, payload);
        }}
      />
    </Card>
  );
}
