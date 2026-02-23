"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Сегодня" },
  { href: "/calendar", label: "Календарь" },
  { href: "/tasks", label: "Задачи" },
  { href: "/routines", label: "Рутины" },
  { href: "/home", label: "Дом" }
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-3 mt-4 grid grid-cols-5 gap-2 rounded-lg border border-border bg-white/90 p-2 backdrop-blur">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md border border-border bg-white px-2 py-2 text-center text-xs",
            pathname === item.href && "bg-slate-900 text-white"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
