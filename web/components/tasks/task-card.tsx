"use client";

import { useState } from "react";
import { AlertTriangle, CalendarX2, CheckCircle2, Circle, Clock3 } from "lucide-react";
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
  description?: string | null;
  status: "OPEN" | "DONE";
  dueDate?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; firstName?: string | null; username?: string | null } | null;
  assignees?: Array<{ user: { id: string; firstName?: string | null; username?: string | null } }>;
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

function DueStatusIcon({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <CalendarX2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (diff < 0) {
    return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (diff === 0) {
    return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function TaskCard({
  task,
  members,
  timezone,
  onDone,
  onUpdate
}: {
  task: Task;
  members: Member[];
  timezone: string;
  onDone: (id: string) => Promise<void>;
  onUpdate: (id: string, payload: { title?: string; assigneeIds?: string[]; dueDate?: string | null; status?: "OPEN" | "DONE" }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const diff = daysUntilDue(task.dueDate, timezone);
  const assigneeUsers = task.assignees?.map((row) => row.user) ?? (task.assignee ? [task.assignee] : []);
  const assigneeLabel =
    assigneeUsers.length === 0
      ? "Без исполнителя"
      : assigneeUsers.length === 1
        ? assigneeUsers[0]?.firstName || assigneeUsers[0]?.username || "Участник"
        : `${assigneeUsers[0]?.firstName || assigneeUsers[0]?.username || "Участник"} +${assigneeUsers.length - 1}`;
  const isDone = task.status === "DONE";

  return (
    <Card className="p-2.5">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => {
            if (!isDone) void onDone(task.id);
          }}
          className="h-4 w-4"
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</p>
          {task.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p> : null}
          <p className="truncate text-xs text-muted-foreground">
            {assigneeLabel} • {formatDateTime(task.dueDate ?? null, timezone)}
          </p>
        </div>
        <Badge variant={dueBadgeVariant(diff)} className="shrink-0 gap-1">
          {isDone ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <DueStatusIcon diff={diff} />}
          <span className={isDone ? "sr-only" : "hidden sm:inline"}>{isDone ? "выполнено" : dueText(diff)}</span>
        </Badge>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Ред.
        </Button>
      </div>
      <TaskEditorSheet
        open={editing}
        onOpenChange={setEditing}
        members={members}
        initial={{
          title: task.title,
          assigneeIds: assigneeUsers.map((user) => user.id),
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
