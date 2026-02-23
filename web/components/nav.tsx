"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Clock3, Home, ListChecks, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Сегодня", icon: Sun },
  { href: "/ai", label: "AI", icon: Sparkles },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/events", label: "События", icon: Clock3 },
  { href: "/tasks", label: "Задачи", icon: CheckSquare },
  { href: "/routines", label: "Рутина", icon: ListChecks },
  { href: "/home", label: "Дом", icon: Home }
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mt-4 grid grid-cols-7 gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">
      {items.map((item) => (
        (() => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          className={cn(
            "group relative flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-xs font-medium transition-all duration-200 ease-out",
            isActive
              ? "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-1 ring-primary/30"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-0 rounded-lg",
              isActive
                ? "bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.28),transparent_58%)]"
                : "opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),transparent_58%)]"
            )}
          />
          <Icon
            className={cn(
              "relative z-[1] h-5 w-5 transition-transform duration-200 ease-out",
              isActive ? "scale-110 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" : "group-hover:scale-105"
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{item.label}</span>
        </Link>
          );
        })()
      ))}
    </nav>
  );
}
