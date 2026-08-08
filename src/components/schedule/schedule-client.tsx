"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteSession } from "@/lib/actions/schedule";
import { formatDay, formatMonth, formatTime, todayStr } from "@/lib/date";
import { ScheduleForm, type SessionRow } from "./schedule-form";

function byDateTime(a: SessionRow, b: SessionRow) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.startTime < b.startTime ? -1 : 1;
}

function groupByDate(sessions: SessionRow[]) {
  const map = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const list = map.get(session.date) ?? [];
    list.push(session);
    map.set(session.date, list);
  }
  return [...map.entries()];
}

function SessionCard({
  session,
  onEdit,
  onDelete,
  compact = false,
}: {
  session: SessionRow;
  onEdit: (session: SessionRow) => void;
  onDelete: (session: SessionRow) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        {compact ? null : (
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-gold/20 text-gold-foreground">
            <span className="text-sm font-semibold leading-none">{formatDay(session.date)}</span>
            <span className="text-[10px] leading-tight">{formatMonth(session.date)}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.title}</p>
          <p className="text-xs text-muted-foreground">
            {session.programme} · {formatTime(session.startTime)} – {formatTime(session.endTime)}
          </p>
          {session.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{session.description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" onClick={() => onEdit(session)} aria-label="Edit session">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={() => onDelete(session)}
          aria-label="Delete session"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ScheduleClient({ initialSessions }: { initialSessions: SessionRow[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [addOpen, setAddOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = todayStr();
  const upcoming = useMemo(
    () => sessions.filter((s) => s.date >= today).sort(byDateTime),
    [sessions, today]
  );
  const past = useMemo(
    () => sessions.filter((s) => s.date < today).sort(byDateTime),
    [sessions, today]
  );

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteSession(deleteTarget.id);
      if (result.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success("Session deleted.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Training Schedule</h1>
          <p className="text-sm text-muted-foreground">Plan and manage training sessions.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">No sessions scheduled</p>
              <p className="text-sm text-muted-foreground">Add your first training session to get started.</p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No upcoming sessions scheduled.
                </CardContent>
              </Card>
            ) : (
              groupByDate(upcoming).map(([date, sessionsOnDate]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatDay(date)} {formatMonth(date)}
                  </p>
                  <div className="space-y-2">
                    {sessionsOnDate.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        onEdit={setEditSession}
                        onDelete={setDeleteTarget}
                        compact
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          {past.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Past ({past.length})</h2>
              <div className="space-y-2">
                {past.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onEdit={setEditSession}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add session</DialogTitle>
            <DialogDescription>Schedule a new training session.</DialogDescription>
          </DialogHeader>
          <ScheduleForm
            mode="create"
            onSuccess={() => {
              setAddOpen(false);
              toast.success("Session added.");
            }}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editSession} onOpenChange={(open) => !open && setEditSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>Update the session details.</DialogDescription>
          </DialogHeader>
          {editSession ? (
            <ScheduleForm
              mode="edit"
              session={editSession}
              onSuccess={() => {
                setEditSession(null);
                toast.success("Session updated.");
              }}
              onCancel={() => setEditSession(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} will be permanently removed from the schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
