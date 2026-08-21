"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/actions/notifications";
import { listSupportTickets, type SupportTicketRow } from "@/lib/actions/support";

function timeAgo(value: string): string {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

type NotificationBellProps = {
  count: number;
  /** Students see in-app notifications; staff see open support tickets. */
  variant: "notifications" | "tickets";
};

export function NotificationBell({ count, variant }: NotificationBellProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [tickets, setTickets] = useState<SupportTicketRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      if (variant === "notifications") {
        setNotifications(await listNotifications());
      } else {
        const all = await listSupportTickets();
        setTickets(all.filter((ticket) => ticket.status === "open"));
      }
    } finally {
      setLoading(false);
    }
  }

  function openNotification(row: NotificationRow) {
    startTransition(async () => {
      if (!row.read) await markNotificationRead(row.id);
      setNotifications(
        (prev) => prev?.map((item) => (item.id === row.id ? { ...item, read: true } : item)) ?? null
      );
      router.refresh();
      if (row.link) router.push(row.link);
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setNotifications((prev) => prev?.map((item) => ({ ...item, read: true })) ?? null);
      router.refresh();
    });
  }

  const hasUnread = notifications?.some((row) => !row.read) ?? false;
  const label =
    variant === "notifications"
      ? `Notifications${count > 0 ? ` (${count} unread)` : ""}`
      : `Support tickets${count > 0 ? ` (${count} open)` : ""}`;

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="relative"
          aria-label={label}
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">
            {variant === "notifications" ? "Notifications" : "Open tickets"}
          </span>
          {variant === "notifications" && hasUnread ? (
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={markAll}
              className="gap-1 text-xs text-muted-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="border-t border-border">
          {variant === "notifications" ? (
            notifications === null ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {loading ? "Loading…" : "Could not load notifications."}
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {notifications.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(row)}
                      className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                        row.read ? "" : "bg-primary/5"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${row.read ? "text-muted-foreground" : "font-medium"}`}>
                          {row.title}
                        </p>
                        {row.body ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{row.body}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {timeAgo(row.createdAt)}
                        </p>
                      </div>
                      {!row.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                      ) : row.link ? (
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : tickets === null ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {loading ? "Loading…" : "Could not load tickets."}
            </p>
          ) : tickets.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No open tickets</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => router.push("/support")}
                    className="flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{ticket.ticketNumber}</span>
                      <span className="text-sm">{ticket.name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground/70">
                        {timeAgo(ticket.createdAt)}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {ticket.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
