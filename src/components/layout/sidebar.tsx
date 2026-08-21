"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";

export function Sidebar({
  role,
  openTicketCount = 0,
  userName,
  userRole,
}: {
  role: string;
  openTicketCount?: number;
  userName?: string;
  userRole?: string;
}) {
  const { collapsed, collapse } = useSidebar();
  const initials = (userName || "User")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      inert={collapsed}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-surface shadow-lg transition-[width] duration-300 ease-in-out md:flex rounded-r-2xl ${
        collapsed ? "w-0 overflow-hidden shadow-none" : "w-64 lg:w-72 xl:w-80"
      }`}
    >
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-inner">
          <svg className="h-6 w-6 text-on-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        </div>
        <p className="font-heading text-xl font-semibold text-primary tracking-tight leading-none">FlowTrack</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav role={role} openTicketCount={openTicketCount} onNavigate={collapse} />
      </div>
      <div className="mt-auto border-t border-outline-variant/20 px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-on-surface">{userName || "User"}</p>
            <p className="text-xs text-on-surface-variant truncate">{userRole || "User"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
