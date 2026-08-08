"use client";

import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";

export function Sidebar({ role }: { role: string }) {
  const { collapsed, collapse } = useSidebar();

  return (
    <aside
      inert={collapsed}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-300 ease-in-out md:flex ${
        collapsed ? "w-0 overflow-hidden border-r-0" : "w-64"
      }`}
    >
      <div className="flex h-14 items-center border-b px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav role={role} onNavigate={collapse} />
      </div>
    </aside>
  );
}
