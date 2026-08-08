import { asc, eq } from "drizzle-orm";
import { AttendanceClient } from "@/components/attendance/attendance-client";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import { todayStr } from "@/lib/date";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr();

  const database = db();

  const [traineeRows, recordRows] = await Promise.all([
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
        traineeName: trainees.fullName,
        registrationNumber: trainees.registrationNumber,
      })
      .from(attendance)
      .innerJoin(trainees, eq(attendance.traineeId, trainees.id))
      .where(eq(attendance.date, day)),
  ]);

  return (
    <AttendanceClient
      key={day}
      date={day}
      trainees={traineeRows}
      initialRecords={recordRows.map((row) => ({
        id: row.traineeId,
        traineeId: row.traineeId,
        status: row.status,
        traineeName: row.traineeName,
        registrationNumber: row.registrationNumber,
      }))}
    />
  );
}
