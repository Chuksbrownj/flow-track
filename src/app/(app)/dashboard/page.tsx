import { and, count, eq, gte } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { ClipboardList, UserCheck, UserX, Users } from "lucide-react";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { CourseSelectBanner } from "@/components/dashboard/course-select";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { assessmentScores, attendance, trainees, trainingSchedule } from "@/db/schema";
import { daysAgoStr, formatMonth, formatDay, formatTime, formatLongDate, todayStr } from "@/lib/date";
import { settleAttendance } from "@/lib/attendance-settle";
import { listCourseNames } from "@/lib/courses";

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
  const isAdmin = user.role === "admin";
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

  const programmes = [...new Set(upcoming.map((session) => session.programme))].map(
    (programme) => ({
      programme,
      sessions: upcoming.filter((session) => session.programme === programme).length,
    })
  );

  return (
    <div className="space-y-6">
      {needsCourse ? <CourseSelectBanner courses={courseNames} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        {isAdmin ? (
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-surface-container-low text-on-surface-variant border-0">
            Admin · {user.topic ?? "Course not selected"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-surface-container-low text-on-surface-variant border-0">
            Master admin{user.topic ? ` · Trainer: ${user.topic}` : ""}
          </Badge>
        )}
        <p className="text-xs text-on-surface-variant">{formatLongDate()}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total trainees" value={totalTrainees[0]?.value ?? 0} icon={Users} />
        <StatCard title="Present today" value={presentToday[0]?.value ?? 0} icon={UserCheck} />
        <StatCard title="Absent today" value={absentToday[0]?.value ?? 0} icon={UserX} hintColor="destructive" />
        <StatCard title="Assessments recorded" value={assessmentCount[0]?.value ?? 0} icon={ClipboardList} />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left column: chart */}
        <div className="xl:col-span-8">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Attendance overview</h2>
                <p className="text-sm text-on-surface-variant">Present vs absent over the last 7 days</p>
              </div>
            </div>
            <AttendanceChart data={weekData} />
          </div>
        </div>

        {/* Right column: upcoming sessions */}
        <div className="xl:col-span-4">
          <div className="flex h-full flex-col rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-on-surface">Upcoming training</h2>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No upcoming sessions scheduled.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((session) => (
                  <div
                    key={session.id}
                    className="flex gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-outline-variant/20 hover:bg-surface-container-low"
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-sm font-bold leading-none">
                        {formatDay(session.date)}
                      </span>
                      <span className="text-[10px] font-medium uppercase">{formatMonth(session.date)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{session.title}</p>
                      <p className="flex items-center gap-1 text-xs text-on-surface-variant font-mono">
                        {formatTime(session.startTime)} – {formatTime(session.endTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto pt-5">
              <a
                href="/schedule"
                className="block rounded-lg border border-primary/20 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                View Full Schedule
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Programme summary */}
      {programmes.length > 0 ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-on-surface">Programme overview</h2>
          <div className="flex flex-wrap gap-3">
            {programmes.map((programme) => (
              <div
                key={programme.programme}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-4 py-1.5 text-sm font-medium text-on-surface"
              >
                {programme.programme}
                <span className="rounded-full bg-primary-container px-2 py-0.5 text-xs font-semibold text-on-primary-container tabular-nums">
                  {programme.sessions}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
