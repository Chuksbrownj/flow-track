import { desc, eq } from "drizzle-orm";
import { Download, BookOpen, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { assessmentScores, courses, trainees, trainingSchedule } from "@/db/schema";
import { formatDay, formatMonth, formatTime, todayStr } from "@/lib/date";

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
        <h1 className="text-2xl font-bold font-heading text-primary">My dashboard</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </CardContent>
        </Card>
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

  const latestWeek = latestRows[0]?.week ?? null;
  const latestRowsForWeek = latestRows.filter((row) => row.week === latestWeek);
  const scoreEntries = courseRows.map((course) => {
    const match = latestRowsForWeek.find((row) => row.courseId === course.id);
    return { label: course.name, value: match?.score ?? null };
  });
  const recorded = scoreEntries
    .map((entry) => entry.value)
    .filter((value): value is number => value !== null);
  const average =
    recorded.length === 0
      ? null
      : Math.round((recorded.reduce((sum, value) => sum + value, 0) / recorded.length) * 10) / 10;

  const isPending = trainee.status === "pending";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-heading text-primary">
              Welcome back, {user.name?.split(" ")[0] || "Student"}.
            </h1>
            <p className="mt-1 text-muted-foreground">
              You have {latestRows.length} recent assessments. Keep up the good work on your recent modules.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overall GPA</p>
              <p className="text-2xl font-bold text-primary">{average !== null ? (average / 25).toFixed(1) : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credits</p>
              <p className="text-2xl font-bold">{recorded.length * 3}/60</p>
            </div>
          </div>
        </div>
      </div>

      {isPending ? (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-foreground">
          Your account is awaiting confirmation by a trainer. You&apos;ll be able to use the
          programme features once your registration is approved.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Latest Assessments</CardTitle>
              <a href="/assessments" className="text-sm font-medium text-primary hover:underline">
                View All
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Course</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Assessment</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRowsForWeek.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No assessments recorded yet.
                      </td>
                    </tr>
                  ) : (
                    latestRowsForWeek.map((row, i) => {
                      const course = courseRows.find((c) => c.id === row.courseId);
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3 text-sm font-medium">{course?.name ?? "Unknown"}</td>
                          <td className="py-3 text-sm text-muted-foreground">Week {row.week}</td>
                          <td className="py-3 text-sm text-muted-foreground">Recent</td>
                          <td className="py-3 text-sm font-semibold text-right text-primary">
                            {row.score !== null ? `${row.score}%` : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="flex flex-col items-center justify-center p-4 text-center">
              <BookOpen className="h-8 w-8 text-primary mb-2" />
              <p className="text-sm font-medium">Register Course</p>
            </Card>
            <Card className="flex flex-col items-center justify-center p-4 text-center">
              <Download className="h-8 w-8 text-primary mb-2" />
              <p className="text-sm font-medium">Transcript</p>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Upcoming</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming sessions today.</p>
              ) : (
                upcomingSessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-[10px] font-medium uppercase">
                        {formatMonth(session.date)}
                      </span>
                      <span className="text-lg font-bold leading-none">
                        {formatDay(session.date)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{session.title}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTime(session.startTime)} - {formatTime(session.endTime)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
