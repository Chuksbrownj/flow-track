import { and, eq, gte, lte } from "drizzle-orm";
import { CalendarCheck2, GraduationCap, Trophy, User } from "lucide-react";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { StatusBadge } from "@/components/app/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { assessments, attendance, trainees } from "@/db/schema";
import { currentMonth, formatDate, monthRange } from "@/lib/date";

export const metadata = { title: "My dashboard" };

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value || "—"}</p>
    </div>
  );
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { month } = await searchParams;
  const monthParam = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const { start, end } = monthRange(monthParam);

  const [trainee] = await db()
    .select()
    .from(trainees)
    .where(eq(trainees.userId, session.user.id ?? ""))
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

  const [monthRows, assessmentRows] = await Promise.all([
    db()
      .select({ date: attendance.date, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.traineeId, trainee.id),
          gte(attendance.date, start),
          lte(attendance.date, end)
        )
      ),
    db()
      .select({
        graphicDesign: assessments.graphicDesign,
        animation: assessments.animation,
        dataAnalysis: assessments.dataAnalysis,
        hpLife: assessments.hpLife,
      })
      .from(assessments)
      .where(eq(assessments.traineeId, trainee.id))
      .limit(1),
  ]);

  const assessment = assessmentRows[0];
  const scoreEntries = [
    { label: "Graphic Design", value: assessment?.graphicDesign ?? null },
    { label: "2D & 3D Animation", value: assessment?.animation ?? null },
    { label: "Data Analysis", value: assessment?.dataAnalysis ?? null },
    { label: "HP LIFE", value: assessment?.hpLife ?? null },
  ];
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>Your registration details.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" value={trainee.fullName} />
            <Field label="Registration number" value={trainee.registrationNumber} />
            <Field label="Email" value={trainee.email} />
            <Field label="Phone" value={trainee.phone} />
            <Field label="Gender" value={trainee.gender} />
            <Field label="Joined" value={formatDate(trainee.createdAt.toISOString())} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Assessments
            </CardTitle>
            <CardDescription>Your recorded scores by programme area.</CardDescription>
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
            {!assessment ? (
              <p className="text-sm text-muted-foreground">
                No assessments recorded yet.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              Attendance calendar
            </CardTitle>
            <CardDescription>Your present and absent days for the selected month.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthCalendar
              month={monthParam}
              records={monthRows.map((row) => ({ date: row.date, status: row.status }))}
              mode="trainee"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
