"use client";

import { cn } from "@/lib/utils";

type AlertProps = {
  variant?: "info" | "error" | "success" | "warning";
  children: React.ReactNode;
  className?: string;
};

const styles: Record<NonNullable<AlertProps["variant"]>, string> = {
  info: "border-border bg-secondary text-foreground",
  error: "border-danger/25 bg-danger/10 text-danger",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning"
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  return <div className={cn("rounded-lg border px-3 py-2 text-sm", styles[variant], className)}>{children}</div>;
}
