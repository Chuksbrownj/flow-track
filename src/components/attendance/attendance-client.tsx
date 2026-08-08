"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmAttendance, markAttendance } from "@/lib/actions/attendance";
import { MonthCalendar, type CalendarRecord } from "./month-calendar";

export type TraineeOption = {
  id: string;
  registrationNumber: string | null;
  fullName: string;
};

export type AttendanceRecord = {
  id: string;
  traineeId: string;
  status: string;
  traineeName: string;
  registrationNumber: string | null;
  source?: string;
};

export type MonthRecord = {
  traineeId: string;
  date: string;
  status: string;
};

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${className ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function AttendanceClient({
  date,
  month,
  trainees,
  initialRecords,
  monthRecords,
}: {
  date: string;
  month: string;
  trainees: TraineeOption[];
  initialRecords: AttendanceRecord[];
  monthRecords: MonthRecord[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState(initialRecords);
  const [monthState, setMonthState] = useState<MonthRecord[]>(monthRecords);
  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(
    trainees[0]?.id ?? null
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return trainees
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          (t.registrationNumber?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 8);
  }, [trainees, query]);

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const pending = records.filter((r) => r.status === "pending").length;
  const total = present + absent;
  const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

  const selectedTrainee = trainees.find((t) => t.id === selectedTraineeId) ?? null;
  const selectedTraineeCalendar: CalendarRecord[] = useMemo(
    () =>
      monthState
        .filter((r) => r.traineeId === selectedTraineeId)
        .map((r) => ({ date: r.date, status: r.status })),
    [monthState, selectedTraineeId]
  );

  function applyRecord(traineeId: string, status: "present" | "absent") {
    const trainee = trainees.find((t) => t.id === traineeId);
    setRecords((prev) => {
      const existing = prev.find((r) => r.traineeId === traineeId);
      if (existing) {
        return prev.map((r) =>
          r.traineeId === traineeId ? { ...r, status, source: r.source ?? "manual" } : r
        );
      }
      return [
        ...prev,
        {
          id: traineeId,
          traineeId,
          status,
          traineeName: trainee?.fullName ?? "",
          registrationNumber: trainee?.registrationNumber ?? null,
          source: "manual",
        },
      ];
    });
    setMonthState((prev) => {
      const existing = prev.find((r) => r.traineeId === traineeId && r.date === date);
      if (existing) {
        return prev.map((r) =>
          r.traineeId === traineeId && r.date === date ? { ...r, status } : r
        );
      }
      return [...prev, { traineeId, date, status }];
    });
  }

  function handleMark(traineeId: string, status: "present" | "absent") {
    setPendingId(traineeId);
    startTransition(async () => {
      const result = await markAttendance(traineeId, status, date);
      setPendingId(null);
      if (result.ok) {
        applyRecord(traineeId, status);
        toast.success(`${status === "present" ? "Marked present" : "Marked absent"}.`);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleConfirm(traineeId: string, status: "present" | "absent") {
    setPendingId(traineeId);
    startTransition(async () => {
      const result = await confirmAttendance(traineeId, status, date);
      setPendingId(null);
      if (result.ok) {
        applyRecord(traineeId, status);
        toast.success(status === "present" ? "Check-in confirmed." : "Check-in rejected.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function changeDate(next: string) {
    if (!next) return;
    router.push(`/attendance?date=${next}&month=${month}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Mark trainees as present or absent.</p>
        </div>
        <div className="w-full sm:w-auto">
          <Label htmlFor="date" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Date
          </Label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value)}
              className="pl-9 sm:w-44"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Present" value={present} className="text-primary" />
        <Stat label="Absent" value={absent} className="text-destructive" />
        <Stat label="Pending confirmation" value={pending} className="text-gold-foreground" />
        <Stat label="Attendance rate" value={percentage} />
      </div>

      {pending > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending check-ins</CardTitle>
            <CardDescription>
              Auto check-ins awaiting confirmation. Confirm or reject them from any device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {records
                .filter((record) => record.status === "pending")
                .map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{record.traineeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {record.registrationNumber ?? "—"}
                        {record.source === "device" ? " · device check-in" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status="pending" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-primary"
                        disabled={pendingId === record.traineeId}
                        onClick={() => handleConfirm(record.traineeId, "present")}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive"
                        disabled={pendingId === record.traineeId}
                        onClick={() => handleConfirm(record.traineeId, "absent")}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mark attendance</CardTitle>
            <CardDescription>Search by name or registration number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search trainees..."
                className="pl-9"
                aria-label="Search trainees"
              />
            </div>

            {matched.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">
                  {query.trim()
                    ? "No matching trainees"
                    : trainees.length === 0
                      ? "No active trainees yet"
                      : "Type to find a trainee"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {query.trim()
                    ? "Try a different name or registration number."
                    : trainees.length === 0
                      ? "Approve pending signups in the Trainees module first."
                      : "Results will appear here as you type."}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {matched.map((t) => {
                  const current = records.find((r) => r.traineeId === t.id)?.status;
                  const busy = pendingId === t.id;
                  return (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.fullName}</p>
                        <p className="text-xs text-muted-foreground">{t.registrationNumber ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {current ? <StatusBadge status={current} /> : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-primary"
                          disabled={busy}
                          onClick={() => handleMark(t.id, "present")}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive"
                          disabled={busy}
                          onClick={() => handleMark(t.id, "absent")}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          Absent
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Records for {date}</CardTitle>
            <CardDescription>
              {total} of {trainees.length} active trainees recorded
            </CardDescription>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
                <UserCheck className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">No records yet</p>
                <p className="text-xs text-muted-foreground">
                  Mark a trainee present or absent to get started.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {records.map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{record.traineeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {record.registrationNumber ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={record.status} />
                      {record.status === "present" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          disabled={pendingId === record.traineeId}
                          onClick={() => handleMark(record.traineeId, "absent")}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Absent
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary"
                          disabled={pendingId === record.traineeId}
                          onClick={() => handleMark(record.traineeId, "present")}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Present
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Month overview</CardTitle>
            <CardDescription>Present and absent counts per day. Click a day to view it.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthCalendar
              month={month}
              records={monthState}
              mode="overall"
              query={{ date }}
              selectedDate={date}
              onSelectDay={changeDate}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trainee calendar</CardTitle>
            <CardDescription>See one trainee&apos;s attendance across the month.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedTraineeId ?? undefined} onValueChange={setSelectedTraineeId}>
              <SelectTrigger className="w-full" aria-label="Select trainee">
                <SelectValue placeholder="Select trainee" />
              </SelectTrigger>
              <SelectContent>
                {trainees.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedTrainee ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedTrainee.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTrainee.registrationNumber ?? "—"} · {date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-primary"
                    disabled={pendingId === selectedTrainee.id}
                    onClick={() => handleMark(selectedTrainee.id, "present")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Present
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={pendingId === selectedTrainee.id}
                    onClick={() => handleMark(selectedTrainee.id, "absent")}
                  >
                    <XCircle className="h-4 w-4" />
                    Absent
                  </Button>
                </div>
              </div>
            ) : null}

            <MonthCalendar
              month={month}
              records={selectedTraineeCalendar}
              mode="trainee"
              query={{ date }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
