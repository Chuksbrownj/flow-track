import { and, count, eq, gte } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { ClipboardList, UserCheck, UserX, Users, Plus } from "lucide-react";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { CourseSelectBanner } from "@/components/dashboard/course-select";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db/client";
import { assessmentScores, attendance, trainees, trainingSchedule } from "@/db/schema";
import { daysAgoStr, formatMonth, formatDay, formatTime, todayStr } from "@/lib/date";
import { settleAttendance } from "@/lib/attendance-settle";
import { listCourseNames } from "@/lib/courses";
import Link from "next/link";

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
  const user = await requireStaff();
  await settleAttendance();
  const database = db();
  const today = todayStr();
  const isStaff = user.role === "admin" || user.role === "master_admin";

  const courseNames = await listCourseNames();
  const needsCourse = isStaff && !user.topic;

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
      database.select({ value: count() }).from(assessmentScores),
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

  return (
    <div className="space-y-6">
      {needsCourse ? <CourseSelectBanner courses={courseNames} /> : null}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-heading text-primary">Overview</h1>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Search..."
              className="h-10 w-64 rounded-lg border bg-background px-4 pl-10 text-sm"
            />
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Trainees"
          value={totalTrainees[0]?.value ?? 0}
          icon={Users}
          hint="12% vs last month"
          hintIcon="up"
        />
        <StatCard
          title="Present Today"
          value={presentToday[0]?.value ?? 0}
          icon={UserCheck}
          hint="88% attendance rate"
        />
        <StatCard
          title="Absent Today"
          value={absentToday[0]?.value ?? 0}
          icon={UserX}
          hint="3% vs yesterday"
          hintIcon="down"
          hintColor="destructive"
        />
        <StatCard
          title="Active Assessments"
          value={assessmentCount[0]?.value ?? 0}
          icon={ClipboardList}
          hint="2 ending soon"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Attendance Trends</CardTitle>
                <p className="text-sm text-muted-foreground">Weekly overview of trainee participation</p>
              </div>
              <Badge variant="outline">This Week</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <AttendanceChart data={weekData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Upcoming Sessions</CardTitle>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            ) : (
              upcoming.map((session) => (
                <div key={session.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="text-lg font-bold leading-none">
                      {formatDay(session.date)}
                    </span>
                    <span className="text-[10px] font-medium leading-tight uppercase">
                      {formatMonth(session.date)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{session.title}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatTime(session.startTime)} - {formatTime(session.endTime)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    Pending
                  </Badge>
                </div>
              ))
            )}
            {upcoming.length > 0 && (
              <Link href="/schedule">
                <Button variant="outline" className="w-full">
                  View Full Schedule
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
