"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { DueDatePicker } from "@/components/tasks/due-date-picker";

type Member = {
  user: { id: string; firstName?: string | null; username?: string | null };
};

type TaskPayload = {
  title: string;
  assigneeIds: string[];
  dueDate: string | null;
  status: "OPEN" | "DONE";
  eventId?: string | null;
};

export function TaskEditorSheet({
  open,
  onOpenChange,
  members,
  initial,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  initial?: Partial<TaskPayload>;
  onSave: (payload: TaskPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "DONE">("OPEN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setAssigneeIds(initial?.assigneeIds ?? []);
    setDueDate(initial?.dueDate ?? null);
    setStatus(initial?.status ?? "OPEN");
  }, [open, initial]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader>
        <SheetTitle>{initial ? "Редактировать задачу" : "Новая задача"}</SheetTitle>
      </SheetHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="field-label">Название</p>
          <Input placeholder="Например: вынести мусор" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="field-label">Исполнители</p>
          <AssigneePicker members={members} values={assigneeIds} onChange={setAssigneeIds} />
        </div>
        <div className="space-y-1.5">
          <p className="field-label">Дедлайн</p>
          <DueDatePicker value={dueDate} onChange={setDueDate} />
        </div>
        <div className="space-y-1.5">
          <p className="field-label">Статус</p>
          <select
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as "OPEN" | "DONE")}
          >
            <option value="OPEN">○ Открыта</option>
            <option value="DONE">✓ Выполнена</option>
          </select>
        </div>
        <Button
          disabled={!title.trim() || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                title: title.trim(),
                assigneeIds,
                dueDate,
                status
              });
              onOpenChange(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </Button>
      </div>
    </Sheet>
  );
}
