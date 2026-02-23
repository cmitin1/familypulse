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

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
            {initials}
          </div>
          <div>
          <p className="font-medium">{task.title}</p>
          <p className="text-xs text-slate-500">{assigneeName}</p>
          </div>
        </div>
        <Badge variant={task.status === "DONE" ? "success" : "outline"}>{task.status.toLowerCase()}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={dueBadgeVariant(diff)}>{dueText(diff)}</Badge>
        <span className="text-slate-500">{formatDateTime(task.dueDate ?? null, timezone)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" disabled={task.status === "DONE"} onClick={() => onDone(task.id)}>
          Выполнено
        </Button>
        <select
          className="h-9 rounded-md border border-border px-2 text-xs"
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
          Редакт.
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
