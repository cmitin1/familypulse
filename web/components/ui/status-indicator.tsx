"use client";

import { Check, Circle, CircleSlash2, Clock3, Link2, Link2Off, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKind = "done" | "open" | "enabled" | "disabled" | "closed" | "linked" | "unlinked";

const statusMap: Record<StatusKind, { label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }> = {
  done: { label: "Выполнено", icon: Check },
  open: { label: "Открыто", icon: Circle },
  enabled: { label: "Включено", icon: Check },
  disabled: { label: "Отключено", icon: X },
  closed: { label: "Закрыто", icon: Clock3 },
  linked: { label: "Привязано", icon: Link2 },
  unlinked: { label: "Не привязано", icon: Link2Off }
};

export function StatusIndicator({
  kind,
  showLabel = false,
  className
}: {
  kind: StatusKind;
  showLabel?: boolean;
  className?: string;
}) {
  const item = statusMap[kind];
  const Icon = item?.icon ?? CircleSlash2;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label={item.label}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {showLabel ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </span>
  );
}
