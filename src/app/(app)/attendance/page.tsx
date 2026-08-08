import { and, asc, eq, gte, lte } from "drizzle-orm";
import { AttendanceClient } from "@/components/attendance/attendance-client";
import { ProfileAttendance } from "@/components/profile/profile-attendance";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import {
  attendanceEditable,
  currentMonth,
  isCheckinOpen,
  monthRange,
  todayStr,
} from "@/lib/date";
import { settleAttendance } from "@/lib/attendance-settle";

export const metadata = { title: "Attendance" };

function validMonth(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonth();
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
}) {
  const user = await requireUser();

  // Settle no-sign -> absent and unconfirmed -> absent rules before reading.
  await settleAttendance();

  // Trainee self-service view (their own check-in page).
  if (user.role === "trainee") {
    const { month } = await searchParams;
    const monthParam = validMonth(month);
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

  // Staff management view (master admin + trainers).
  const { date, month } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr();
  const monthParam = validMonth(month);
  const { start: monthStart, end: monthEnd } = monthRange(monthParam);

  const database = db();

  const [traineeRows, recordRows, monthRows] = await Promise.all([
    database
      .select({
        id: trainees.id,
        registrationNumber: trainees.registrationNumber,
        fullName: trainees.fullName,
      })
      .from(trainees)
      .where(eq(trainees.status, "active"))
      .orderBy(asc(trainees.fullName)),
    database
      .select({
        traineeId: attendance.traineeId,
        status: attendance.status,
        source: attendance.source,
        traineeName: trainees.fullName,
        registrationNumber: trainees.registrationNumber,
      })
      .from(attendance)
      .innerJoin(trainees, eq(attendance.traineeId, trainees.id))
      .where(eq(attendance.date, day)),
    database
      .select({
        traineeId: attendance.traineeId,
        date: attendance.date,
        status: attendance.status,
      })
      .from(attendance)
      .where(and(gte(attendance.date, monthStart), lte(attendance.date, monthEnd))),
  ]);

  const editable = attendanceEditable(day);

  return (
    <AttendanceClient
      key={`${day}-${monthParam}`}
      date={day}
      month={monthParam}
      editable={editable}
      trainees={traineeRows}
      initialRecords={recordRows.map((row) => ({
        id: row.traineeId,
        traineeId: row.traineeId,
        status: row.status,
        source: row.source,
        traineeName: row.traineeName,
        registrationNumber: row.registrationNumber,
      }))}
      monthRecords={monthRows.map((row) => ({
        traineeId: row.traineeId,
        date: row.date,
        status: row.status,
      }))}
    />
  );
}
