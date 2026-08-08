import { and, count, eq, gte } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { ClipboardList, UserCheck, UserX, Users } from "lucide-react";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db/client";
import { assessments, attendance, trainees, trainingSchedule } from "@/db/schema";
import { daysAgoStr, formatMonth, formatDay, formatTime, formatLongDate, todayStr } from "@/lib/date";
import { settleAttendance } from "@/lib/attendance-settle";

export const metadata = { title: "Dashboard" };

function shortDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DashboardPage() {
  await requireAdmin();
  await settleAttendance();
  const database = db();
  const today = todayStr();

  const [totalTrainees, presentToday, absentToday, assessmentCount, weekRows, upcoming] =
    await Promise.all([
      database.select({ value: count() }).from(trainees),
      database
        .select({ value: count() })
        .from(attendance)
        .where(and(eq(attendance.date, today), eq(attendance.status, "present"))),
      database
        .select({ value: count() })
        .from(attendance)
        .where(and(eq(attendance.date, today), eq(attendance.status, "absent"))),
      database.select({ value: count() }).from(assessments),
      database
        .select({ date: attendance.date, status: attendance.status })
        .from(attendance)
        .where(gte(attendance.date, daysAgoStr(6))),
      database
        .select()
        .from(trainingSchedule)
        .where(gte(trainingSchedule.date, today))
        .orderBy(trainingSchedule.date)
        .limit(5),
    ]);

  const weekData = Array.from({ length: 7 }, (_, i) => {
    const date = daysAgoStr(6 - i);
    const rows = weekRows.filter((row) => row.date === date);
    return {
      day: shortDay(date),
      present: rows.filter((row) => row.status === "present").length,
      absent: rows.filter((row) => row.status === "absent").length,
    };
  });

  const programmes = [...new Set(upcoming.map((session) => session.programme))].map(
    (programme) => ({
      programme,
      sessions: upcoming.filter((session) => session.programme === programme).length,
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{formatLongDate()}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total trainees" value={totalTrainees[0]?.value ?? 0} icon={Users} />
        <StatCard title="Present today" value={presentToday[0]?.value ?? 0} icon={UserCheck} />
        <StatCard title="Absent today" value={absentToday[0]?.value ?? 0} icon={UserX} />
        <StatCard
          title="Assessments recorded"
          value={assessmentCount[0]?.value ?? 0}
          icon={ClipboardList}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance overview</CardTitle>
            <CardDescription>Present vs absent over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceChart data={weekData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming training</CardTitle>
            <CardDescription>Next scheduled sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            ) : (
              upcoming.map((session) => (
                <div key={session.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-gold/20 text-gold-foreground">
                    <span className="text-xs font-semibold leading-none">
                      {formatDay(session.date)}
                    </span>
                    <span className="text-[10px] leading-tight">{formatMonth(session.date)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(session.startTime)} – {formatTime(session.endTime)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Programme summary</CardTitle>
          <CardDescription>Upcoming sessions by programme</CardDescription>
        </CardHeader>
        <CardContent>
          {programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {programmes.map((programme) => (
                <Badge
                  key={programme.programme}
                  variant="secondary"
                  className="gap-2 px-3 py-1.5 text-sm"
                >
                  {programme.programme}
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    {programme.sessions}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
