"use client";

import { cn } from "@/lib/utils";

type AlertProps = {
  variant?: "info" | "error" | "success";
  children: React.ReactNode;
  className?: string;
};

const styles: Record<NonNullable<AlertProps["variant"]>, string> = {
  info: "border-slate-200 bg-slate-50 text-slate-700",
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  return <div className={cn("rounded-md border px-3 py-2 text-sm", styles[variant], className)}>{children}</div>;
}
