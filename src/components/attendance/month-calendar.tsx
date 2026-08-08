"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CalendarRecord = { date: string; status: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function gridFor(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m ?? 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return `${y}-${String(m ?? 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({
  month,
  records,
  mode,
  query = {},
  selectedDate,
  onSelectDay,
}: {
  month: string;
  records: CalendarRecord[];
  mode: "overall" | "trainee";
  query?: Record<string, string | undefined>;
  selectedDate?: string | null;
  onSelectDay?: (date: string) => void;
}) {
  const router = useRouter();
  const cells = useMemo(() => gridFor(month), [month]);

  const byDate = useMemo(() => {
    const map: Record<string, { present: number; absent: number; pending: number }> = {};
    for (const record of records) {
      const entry = (map[record.date] ??= { present: 0, absent: 0, pending: 0 });
      if (record.status === "present") entry.present += 1;
      if (record.status === "absent") entry.absent += 1;
      if (record.status === "pending") entry.pending += 1;
    }
    return map;
  }, [records]);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  function navigate(delta: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    params.set("month", shiftMonth(month, delta));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize">
          {new Date(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <p key={day} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {day}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          const counts = byDate[date];
          const isSelected = selectedDate === date;
          const isToday = date === todayStr;

          if (mode === "trainee") {
            const status =
              counts &&
              (counts.present > 0
                ? "present"
                : counts.pending > 0
                  ? "pending"
                  : counts.absent > 0
                    ? "absent"
                    : undefined);
            return (
              <div
                key={date}
                className={`flex aspect-square flex-col items-center justify-center rounded-md border text-xs ${
                  status === "present"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : status === "pending"
                      ? "border-gold/40 bg-gold/15 text-gold-foreground"
                      : status === "absent"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-transparent text-muted-foreground"
                } ${isToday ? "ring-1 ring-ring" : ""} ${isSelected ? "outline outline-1 outline-primary" : ""}`}
              >
                <span className="font-medium">{Number(date.slice(8))}</span>
                {status ? (
                  status === "present" ? (
                    <Check className="h-3 w-3" />
                  ) : status === "pending" ? (
                    <Clock3 className="h-3 w-3" />
                  ) : (
                    <X className="h-3 w-3" />
                  )
                ) : null}
              </div>
            );
          }

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay?.(date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border text-xs transition-colors ${
                counts
                  ? "border-border hover:bg-muted"
                  : "border-transparent text-muted-foreground hover:bg-muted/60"
              } ${isToday ? "ring-1 ring-ring" : ""} ${isSelected ? "outline outline-1 outline-primary" : ""}`}
              aria-label={`View attendance for ${date}`}
            >
              <span className="font-medium">{Number(date.slice(8))}</span>
              {counts ? (
                <span className="flex gap-0.5 leading-none">
                  <span className="font-semibold text-primary">{counts.present}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-semibold text-destructive">{counts.absent}</span>
                  {counts.pending > 0 ? (
                    <>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-semibold text-gold-foreground">{counts.pending}</span>
                    </>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {mode === "overall" ? (
        <div className="flex items-center justify-end gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary" /> Present
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Absent
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gold" /> Pending
          </span>
        </div>
      ) : null}
    </div>
  );
}
