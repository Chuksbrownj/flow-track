"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notifications";

type Row = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

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

export function NotificationsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function open(row: Row) {
    startTransition(async () => {
      if (!row.read) await markNotificationRead(row.id);
      router.refresh();
      if (row.link) router.push(row.link);
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  const hasUnread = initial.some((row) => !row.read);

  return (
    <div className="space-y-1">
      {hasUnread ? (
        <div className="flex justify-end pb-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={markAll}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all as read
          </Button>
        </div>
      ) : null}
      <ul className="divide-y">
        {initial.map((row) => (
          <li key={row.id}>
            {row.link ? (
              <button
                type="button"
                onClick={() => open(row)}
                className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                  row.read ? "" : "bg-primary/5"
                }`}
              >
                <NotificationContent row={row} />
              </button>
            ) : (
              <div
                className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 ${
                  row.read ? "" : "bg-primary/5"
                }`}
              >
                <NotificationContent row={row} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotificationContent({ row }: { row: Row }) {
  return (
    <>
      <div className="min-w-0">
        <p className={`text-sm ${row.read ? "text-muted-foreground" : "font-medium"}`}>
          {row.title}
        </p>
        {row.body ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{row.body}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(row.createdAt)}</p>
      </div>
      {!row.read ? (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
      ) : row.link ? (
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );
}
