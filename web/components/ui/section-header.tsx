"use client";

import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  subtitle,
  action,
  className
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2", className)}>
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="helper-text">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
