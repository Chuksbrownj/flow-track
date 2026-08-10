"use client";

import { useState } from "react";
import { Menu, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";

/**
 * Desktop sidebar control (hidden on mobile, which uses `MobileNav`):
 * - Sidebar expanded → a "collapse" button that hides the fixed sidebar.
 * - Sidebar collapsed → a hamburger at the top-left that opens the nav menu
 *   as an overlay tray sliding over the content.
 */
export function SidebarToggle({ role }: { role: string }) {
  const { collapsed, collapse } = useSidebar();
  const [trayOpen, setTrayOpen] = useState(false);

  if (collapsed) {
    return (
      <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label="Open menu"
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>
              <Brand />
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3">
            <SidebarNav role={role} onNavigate={() => setTrayOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="hidden md:inline-flex"
      aria-label="Collapse sidebar"
      title="Collapse sidebar"
      onClick={collapse}
    >
      <PanelLeftClose className="h-5 w-5" />
    </Button>
  );
}
