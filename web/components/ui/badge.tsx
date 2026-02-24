"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "outline" | "muted" | "ai";
}) {
  return (
    <span
      className={cn(
        "chip-label inline-flex items-center rounded-full border px-2.5 py-1",
        variant === "default" && "border-transparent bg-primary text-primary-foreground",
        variant === "success" && "border-transparent bg-success text-success-foreground",
        variant === "warning" && "border-transparent bg-warning text-warning-foreground",
        variant === "danger" && "border-transparent bg-danger text-danger-foreground",
        variant === "outline" && "border-border bg-card text-foreground",
        variant === "muted" && "border-border bg-muted text-foreground",
        variant === "ai" && "border-ai-border bg-ai text-ai-foreground",
        className
      )}
      {...props}
    />
  );
}
