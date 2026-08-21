"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotificationBell({ count }: { count: number }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className="relative"
      aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Button>
  );
}
