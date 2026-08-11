"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavItems, masterNavItems, traineeNavItems } from "./nav-items";

export function SidebarNav({
  role,
  openTicketCount = 0,
  onNavigate,
}: {
  role: string;
  /** Unresolved support tickets — shown as a badge on the Support item. */
  openTicketCount?: number;
  /** Called after a nav item is clicked (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items =
    role === "master_admin"
      ? masterNavItems
      : role === "admin"
        ? adminNavItems
        : traineeNavItems;

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.href === "/support" && openTicketCount > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
                {openTicketCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
