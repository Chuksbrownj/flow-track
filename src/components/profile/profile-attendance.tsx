"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck2, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkInAttendance } from "@/lib/actions/attendance";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { MonthCalendar, type CalendarRecord } from "@/components/attendance/month-calendar";

export function ProfileAttendance({
  month,
  records,
  todayStatus,
  deviceRegistered,
}: {
  month: string;
  records: CalendarRecord[];
  todayStatus: string | null;
  deviceRegistered: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoRan = useRef(false);

  async function attemptCheckIn(silent: boolean) {
    setBusy(true);
    let fingerprint = "";
    try {
      fingerprint = await getDeviceFingerprint();
    } catch {
      setBusy(false);
      if (!silent) toast.error("Could not read this device's signature. Try again.");
      return;
    }
    startTransition(async () => {
      const result = await checkInAttendance(fingerprint);
      setBusy(false);
      if (result.ok) {
        if (result.message) {
          if (!silent) toast.success(result.message);
          else if (result.message.includes("Checked in")) toast.success(result.message);
        }
        router.refresh();
      } else if (!silent) {
        toast.error(result.error ?? "Could not check in.");
      }
    });
  }

  // Automatic check-in when the trainee opens their profile (their sign-in moment).
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!todayStatus) {
      const id = setTimeout(() => attemptCheckIn(true), 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canCheckIn = !todayStatus;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          Attendance
        </CardTitle>
        <CardDescription>
          Your attendance for {month}. Check-in happens automatically when you sign in from your
          registered device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
              <Fingerprint className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Today</p>
              <p className="text-xs text-muted-foreground">
                {todayStatus
                  ? "Check-in recorded for today."
                  : "Checking in from this device..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {todayStatus ? <StatusBadge status={todayStatus} /> : null}
            <Button
              size="sm"
              className="gap-1.5"
              disabled={busy || isPending || !canCheckIn}
              onClick={() => attemptCheckIn(false)}
            >
              {busy || isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {busy || isPending ? "Checking in..." : canCheckIn ? "Check in" : "Checked in"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Registered device</p>
            <p className="text-xs text-muted-foreground">
              {deviceRegistered
                ? "This device is bound to your account."
                : "Not registered yet — your first check-in binds this device."}
            </p>
          </div>
          <StatusBadge status={deviceRegistered ? "active" : "pending"} />
        </div>

        <MonthCalendar month={month} records={records} mode="trainee" />
      </CardContent>
    </Card>
  );
}
