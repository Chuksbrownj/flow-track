"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems, traineeNavItems, trainerNavItems } from "./nav-items";

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items =
    role === "admin" ? adminNavItems : role === "trainer" ? trainerNavItems : traineeNavItems;

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
