import { desc, eq } from "drizzle-orm";
import { GraduationCap, Trophy } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { assessmentScores, courses, trainees } from "@/db/schema";
import { formatWeek } from "@/lib/date";

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
        <h1 className="text-2xl font-semibold tracking-tight">My dashboard</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [latestRows, courseRows] = await Promise.all([
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {trainee.registrationNumber ?? "Registration pending"}
          </p>
        </div>
        <StatusBadge status={trainee.status} />
      </div>

      {isPending ? (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-foreground">
          Your account is awaiting confirmation by a trainer. You&apos;ll be able to use the
          programme features once your registration is approved.
        </div>
      ) : null}

      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Assessments
            </CardTitle>
            <CardDescription>
              Your latest recorded scores{latestWeek ? ` (${formatWeek(latestWeek)})` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {scoreEntries.map((entry) => (
                <div key={entry.label} className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {entry.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {entry.value !== null ? `${entry.value}%` : "—"}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
                  <Trophy className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">Overall average</p>
              </div>
              <p className="text-xl font-semibold">{average !== null ? `${average}%` : "—"}</p>
            </div>
            {latestRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assessments recorded yet.
              </p>
            ) : null}
          </CardContent>
      </Card>
    </div>
  );
}
