import { and, asc, eq, gte, lte } from "drizzle-orm";
import { AttendanceClient } from "@/components/attendance/attendance-client";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import { currentMonth, monthRange, todayStr } from "@/lib/date";

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
  await requireAdmin();

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

  return (
    <AttendanceClient
      key={`${day}-${monthParam}`}
      date={day}
      month={monthParam}
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
