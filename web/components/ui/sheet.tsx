"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Sheet({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/35" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lg">
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 space-y-1", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}
