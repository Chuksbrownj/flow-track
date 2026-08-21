"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";

export function Sidebar({
  role,
  openTicketCount = 0,
  userName,
  userRole,
  userId,
}: {
  role: string;
  openTicketCount?: number;
  userName?: string;
  userRole?: string;
  userId?: string;
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
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-300 ease-in-out md:flex ${
        collapsed ? "w-0 overflow-hidden border-r-0" : "w-64"
      }`}
    >
      <div className="flex flex-col border-b">
        <div className="flex items-center gap-3 p-5">
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{userName || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{userRole || "User"}</p>
            {userId && <p className="text-[11px] text-muted-foreground">{userId}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-5 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">FT</span>
          </div>
          <p className="text-lg font-bold font-heading text-primary">FlowTrack</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav role={role} openTicketCount={openTicketCount} onNavigate={collapse} />
      </div>
    </aside>
  );
}
