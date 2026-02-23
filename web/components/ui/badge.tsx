"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "warning" | "danger" | "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        variant === "default" && "border-transparent bg-slate-900 text-white",
        variant === "success" && "border-transparent bg-emerald-600 text-white",
        variant === "warning" && "border-transparent bg-amber-500 text-white",
        variant === "danger" && "border-transparent bg-rose-600 text-white",
        variant === "outline" && "border-border bg-white text-slate-700",
        className
      )}
      {...props}
    />
  );
}
