"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Сегодня" },
  { href: "/ai", label: "AI" },
  { href: "/calendar", label: "Календарь" },
  { href: "/events", label: "События" },
  { href: "/tasks", label: "Задачи" },
  { href: "/routines", label: "Рутина" },
  { href: "/home", label: "Дом" }
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mt-4 grid grid-cols-7 gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-xs font-medium text-muted-foreground transition-colors",
            pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-muted hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
