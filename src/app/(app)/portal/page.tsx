import { desc, eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { assessmentScores, courses, trainees, trainingSchedule } from "@/db/schema";
import { formatDay, formatMonth, formatTime, formatWeek, todayStr } from "@/lib/date";

export const metadata = { title: "My dashboard" };

export default async function PortalPage() {
  const user = await requireUser();
  if (user.role === "master_admin" || user.role === "admin") redirect("/dashboard");

  const [trainee] = await db()
    .select()
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);

  if (!trainee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-on-surface">My dashboard</h1>
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant shadow-sm">
            No trainee profile is linked to this account.
          </div>
      </div>
    );
  }

  const [latestRows, courseRows, upcomingSessions] = await Promise.all([
    db()
      .select({
        week: assessmentScores.week,
        courseId: assessmentScores.courseId,
        score: assessmentScores.score,
      })
      .from(assessmentScores)
      .where(eq(assessmentScores.traineeId, trainee.id))
      .orderBy(desc(assessmentScores.week)),
    db().select({ id: courses.id, name: courses.name }).from(courses),
    db()
      .select()
      .from(trainingSchedule)
      .where(eq(trainingSchedule.date, todayStr()))
      .orderBy(trainingSchedule.startTime)
      .limit(3),
  ]);

  // Latest score per course — latestRows is already ordered newest week first,
  // so the first row seen for each course is its most recent assessment.
  const latestByCourse = new Map<string, { week: string; score: number }>();
  for (const row of latestRows) {
    if (!latestByCourse.has(row.courseId)) {
      latestByCourse.set(row.courseId, { week: row.week, score: row.score });
    }
  }
  const latestAssessments = [...latestByCourse.entries()].map(([courseId, entry]) => ({
    courseId,
    week: entry.week,
    score: entry.score,
  }));

  // GPA / Credits are cumulative across every recorded week, not just the latest.
  const recorded = latestRows.map((row) => row.score);
  const average =
    recorded.length === 0
      ? null
      : Math.round((recorded.reduce((sum, value) => sum + value, 0) / recorded.length) * 10) / 10;
  // Each course a trainee has been assessed in earns 3 credits (of 60).
  const earnedCredits = latestByCourse.size * 3;

  const isPending = trainee.status === "pending";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">
              Welcome back, {user.name?.split(" ")[0] || "Student"}.
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              You have {latestRows.length} recent assessments. Keep up the good work on your recent modules.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Overall GPA</p>
                <p className="text-2xl font-bold text-primary">{average !== null ? (average / 25).toFixed(1) : "—"}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Credits</p>
                <p className="text-2xl font-bold text-on-surface">{earnedCredits}/60</p>
              </div>
            </div>
            <p className="text-[11px] text-on-surface-variant">Cumulative across all recorded weeks</p>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="rounded-xl border border-secondary/30 bg-secondary-container/10 px-4 py-3 text-sm text-on-secondary-container">
          Your account is awaiting confirmation by a trainer. You&apos;ll be able to use the
          programme features once your registration is approved.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-on-surface">Latest Assessments</h2>
            <a href="/assessments" className="text-sm font-medium text-primary hover:underline">
              View All
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20 text-left">
                  <th className="pb-3 text-sm font-medium text-on-surface-variant">Course</th>
                  <th className="pb-3 text-sm font-medium text-on-surface-variant">Assessment</th>
                  <th className="pb-3 text-sm font-medium text-on-surface-variant text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {latestAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-sm text-on-surface-variant">
                      No assessments recorded yet.
                    </td>
                  </tr>
                ) : (
                  latestAssessments.map((row) => {
                    const course = courseRows.find((c) => c.id === row.courseId);
                    return (
                      <tr key={row.courseId} className="border-b border-outline-variant/10 last:border-0 transition-colors hover:bg-surface-container-low/50">
                        <td className="py-3 text-sm font-medium text-on-surface">{course?.name ?? "Unknown"}</td>
                        <td className="py-3 text-sm text-on-surface-variant">{formatWeek(row.week)}</td>
                        <td className="py-3 text-sm font-semibold text-right text-primary tabular-nums">
                          {row.score}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-on-surface">Upcoming</h2>
            <div className="space-y-3">
              {upcomingSessions.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No upcoming sessions today.</p>
              ) : (
                upcomingSessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-outline-variant/20 hover:bg-surface-container-low">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-[10px] font-medium uppercase">
                        {formatMonth(session.date)}
                      </span>
                      <span className="text-lg font-bold leading-none">
                        {formatDay(session.date)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-on-surface">{session.title}</p>
                      <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <Clock className="h-3 w-3" />
                        {formatTime(session.startTime)} - {formatTime(session.endTime)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
