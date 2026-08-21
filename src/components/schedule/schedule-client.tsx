"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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

function MiniCalendar({ currentMonth, onPrev, onNext }: { currentMonth: Date; onPrev: () => void; onNext: () => void }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayDate = today.getDate();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="h-8" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(
      <div
        key={d}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
          isCurrentMonth && d === todayDate
            ? "bg-primary text-primary-foreground font-semibold"
            : "text-foreground hover:bg-muted"
        }`}
      >
        {d}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold">
          {currentMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <Button variant="ghost" size="icon" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
        {days}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onEdit,
  onDelete,
  readOnly = false,
}: {
  session: SessionRow;
  onEdit: (session: SessionRow) => void;
  onDelete: (session: SessionRow) => void;
  readOnly?: boolean;
}) {
  const programmeColors: Record<string, string> = {
    "SAFETY PROTOCOLS": "bg-emerald-100 text-emerald-700",
    "TECHNICAL SKILLS": "bg-amber-100 text-amber-700",
    default: "bg-primary/10 text-primary",
  };
  const tagClass = programmeColors[session.programme?.toUpperCase()] ?? programmeColors.default;

  return (
    <div className="flex gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col items-center shrink-0">
        <p className="text-lg font-bold">{formatDay(session.date)}</p>
        <p className="text-xs text-muted-foreground uppercase">{formatMonth(session.date)}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-primary">{session.title}</p>
            {session.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{session.description}</p>
            )}
          </div>
          {!readOnly && (
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
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={tagClass}>
            {session.programme}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatTime(session.startTime)} - {formatTime(session.endTime)}
          </span>
        </div>
        {session.googleFormUrl && (
          <a
            href={session.googleFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Link2 className="h-3.5 w-3.5" />
            Registration Form
          </a>
        )}
      </div>
    </div>
  );
}

export function ScheduleClient({
  initialSessions,
  readOnly = false,
}: {
  initialSessions: SessionRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const sessions = initialSessions;
  const [addOpen, setAddOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter] = useState("all");

  const today = todayStr();
  const upcoming = useMemo(
    () => sessions.filter((s) => s.date >= today).sort(byDateTime),
    [sessions, today]
  );

  const filteredUpcoming = useMemo(() => {
    if (filter === "all") return upcoming;
    return upcoming.filter((s) => s.programme?.toLowerCase() === filter.toLowerCase());
  }, [upcoming, filter]);

  const thisWeekCount = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return sessions.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    }).length;
  }, [sessions]);

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteSession(deleteTarget.id);
      if (result.ok) {
        setDeleteTarget(null);
        toast.success("Session deleted.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-heading text-primary">Training Schedule</h1>
        {!readOnly ? (
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create Session
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <MiniCalendar
            currentMonth={currentMonth}
            onPrev={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            onNext={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
          />
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Week</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-3xl font-bold">{thisWeekCount}</span>
                <span className="text-sm text-muted-foreground">sessions</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upcoming Sessions</h2>
            <div className="flex gap-2">
              {["all", "safety", "technical"].map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                  className={filter === f ? "bg-primary text-primary-foreground" : ""}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {filteredUpcoming.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                No upcoming sessions scheduled.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredUpcoming.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onEdit={setEditSession}
                  onDelete={setDeleteTarget}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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
              router.refresh();
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
                router.refresh();
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
