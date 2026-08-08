import { and, eq, gte, lte } from "drizzle-orm";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import { currentMonth, isCheckinOpen, monthRange, todayStr } from "@/lib/date";
import { settleAttendance } from "@/lib/attendance-settle";
import { ProfileAttendance } from "@/components/profile/profile-attendance";

export const metadata = { title: "Attendance" };

export default async function TraineeAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/dashboard");

  // Bring records up to date before showing them (no-sign -> absent once the
  // day closes, unconfirmed check-ins -> absent after 72 hours).
  await settleAttendance();

  const { month } = await searchParams;
  const monthParam = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const { start, end } = monthRange(monthParam);

  const [trainee] = await db()
    .select({
      id: trainees.id,
      fullName: trainees.fullName,
      registrationNumber: trainees.registrationNumber,
      status: trainees.status,
      deviceFingerprint: trainees.deviceFingerprint,
    })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);

  if (!trainee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [attendanceRows, todayRow] = await Promise.all([
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
      .select({ status: attendance.status })
      .from(attendance)
      .where(and(eq(attendance.traineeId, trainee.id), eq(attendance.date, todayStr())))
      .limit(1),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            {trainee.registrationNumber ?? "Registration pending"}
          </p>
        </div>
        <StatusBadge status={trainee.status} />
      </div>

      <ProfileAttendance
        month={monthParam}
        records={attendanceRows.map((row) => ({ date: row.date, status: row.status }))}
        todayStatus={todayRow[0]?.status ?? null}
        deviceRegistered={!!trainee.deviceFingerprint}
        checkinOpen={isCheckinOpen()}
      />
    </div>
  );
}
