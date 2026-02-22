"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Today" },
  { href: "/tasks", label: "Tasks" },
  { href: "/routines", label: "Routines" },
  { href: "/home", label: "Home" }
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="mt-4 grid grid-cols-4 gap-2">
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
