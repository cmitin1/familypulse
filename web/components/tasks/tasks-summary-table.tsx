"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { TaskCard } from "@/components/tasks/task-card";

type SummaryRow = {
  userId: string;
  name: string;
  open: number;
  overdue: number;
  dueSoon: number;
  doneToday: number;
};

type Task = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  dueDate?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; firstName?: string | null; username?: string | null } | null;
};

type Member = {
  user: { id: string; firstName?: string | null; username?: string | null };
};

export function TasksSummaryTable({
  rows,
  tasks,
  members,
  timezone,
  onDone,
  onReassign,
  onUpdate
}: {
  rows: SummaryRow[];
  tasks: Task[];
  members: Member[];
  timezone: string;
  onDone: (id: string) => Promise<void>;
  onReassign: (id: string, assigneeId: string | null) => Promise<void>;
  onUpdate: (id: string, payload: { title?: string; assigneeId?: string | null; dueDate?: string | null; status?: "OPEN" | "DONE" }) => Promise<void>;
}) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const expandedTasks = useMemo(
    () => tasks.filter((task) => task.assigneeId === expandedUserId),
    [tasks, expandedUserId]
  );

  return (
    <Card className="space-y-3">
      <h2 className="font-medium">Сводка по ответственным</h2>
      <Table>
        <thead>
          <tr className="border-b">
            <TableHead>Участник</TableHead>
            <TableHead>Open</TableHead>
            <TableHead>Overdue</TableHead>
            <TableHead>DueSoon</TableHead>
            <TableHead>DoneToday</TableHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-b">
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedUserId((prev) => (prev === row.userId ? null : row.userId))}
                >
                  {row.name}
                </Button>
              </TableCell>
              <TableCell>{row.open}</TableCell>
              <TableCell>{row.overdue}</TableCell>
              <TableCell>{row.dueSoon}</TableCell>
              <TableCell>{row.doneToday}</TableCell>
            </tr>
          ))}
        </tbody>
      </Table>
      {expandedUserId ? (
        <div className="space-y-2">
          {expandedTasks.length === 0 ? (
            <p className="text-sm text-slate-500">У этого участника пока нет задач по выбранным фильтрам.</p>
          ) : (
            expandedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                members={members}
                timezone={timezone}
                onDone={onDone}
                onReassign={onReassign}
                onUpdate={onUpdate}
              />
            ))
          )}
        </div>
      ) : null}
    </Card>
  );
}
