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
  assigneeId: string | null;
  dueDate: string | null;
  status: "OPEN" | "DONE";
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
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "DONE">("OPEN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setAssigneeId(initial?.assigneeId ?? "");
    setDueDate(initial?.dueDate ?? null);
    setStatus(initial?.status ?? "OPEN");
  }, [open, initial]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader>
        <SheetTitle>{initial ? "Редактировать задачу" : "Новая задача"}</SheetTitle>
      </SheetHeader>
      <div className="space-y-3">
        <Input placeholder="Название задачи" value={title} onChange={(e) => setTitle(e.target.value)} />
        <AssigneePicker members={members} value={assigneeId} onChange={setAssigneeId} />
        <DueDatePicker value={dueDate} onChange={setDueDate} />
        <select
          className="h-10 w-full rounded-md border border-border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as "OPEN" | "DONE")}
        >
          <option value="OPEN">OPEN</option>
          <option value="DONE">DONE</option>
        </select>
        <Button
          disabled={!title.trim() || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                title: title.trim(),
                assigneeId: assigneeId || null,
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
