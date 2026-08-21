import { asc, avg, count, desc, eq } from "drizzle-orm";
import { ReportsClient } from "@/components/reports/reports-client";
import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { assessmentScores, attendance, trainees } from "@/db/schema";
import { settleAttendance } from "@/lib/attendance-settle";
import { listCourses } from "@/lib/courses";

export const metadata = { title: "Reports" };

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toAverage(value: string | null): number | null {
  if (value === null) return null;
  return round(Number(value));
}

export default async function ReportsPage() {
  await requireStaff();
  await settleAttendance();
  const database = db();

  const [
    totalTrainees,
    activeTrainees,
    inactiveTrainees,
    pendingTrainees,
    genderRows,
    presentCount,
    absentCount,
    averageRows,
    traineeRows,
    attendanceRows,
    scoreRows,
    courseRows,
  ] = await Promise.all([
    database.select({ value: count() }).from(trainees),
    database.select({ value: count() }).from(trainees).where(eq(trainees.status, "active")),
    database.select({ value: count() }).from(trainees).where(eq(trainees.status, "inactive")),
    database.select({ value: count() }).from(trainees).where(eq(trainees.status, "pending")),
    database
      .select({ gender: trainees.gender, value: count() })
      .from(trainees)
      .groupBy(trainees.gender),
    database.select({ value: count() }).from(attendance).where(eq(attendance.status, "present")),
    database.select({ value: count() }).from(attendance).where(eq(attendance.status, "absent")),
    database
      .select({ courseId: assessmentScores.courseId, value: avg(assessmentScores.score) })
      .from(assessmentScores)
      .groupBy(assessmentScores.courseId),
    database
      .select({
        registrationNumber: trainees.registrationNumber,
        fullName: trainees.fullName,
        gender: trainees.gender,
        phone: trainees.phone,
        email: trainees.email,
        status: trainees.status,
      })
      .from(trainees)
      .orderBy(asc(trainees.fullName)),
    database
      .select({
        date: attendance.date,
        status: attendance.status,
        traineeName: trainees.fullName,
        registrationNumber: trainees.registrationNumber,
      })
      .from(attendance)
      .innerJoin(trainees, eq(attendance.traineeId, trainees.id))
      .orderBy(desc(attendance.date), asc(trainees.fullName)),
    database
      .select({
        traineeName: trainees.fullName,
        registrationNumber: trainees.registrationNumber,
        courseId: assessmentScores.courseId,
        score: assessmentScores.score,
      })
      .from(assessmentScores)
      .innerJoin(trainees, eq(assessmentScores.traineeId, trainees.id))
      .orderBy(asc(trainees.fullName)),
    listCourses(),
  ]);

  const averageByCourse = new Map(
    averageRows.map((row) => [row.courseId, toAverage(row.value)])
  );
  const assessmentAverages = courseRows.map((course) => ({
    courseId: course.id,
    courseName: course.name,
    average: averageByCourse.get(course.id) ?? null,
  }));

  const scoreByTrainee = new Map<string, { courseId: string; score: number }[]>();
  for (const row of scoreRows) {
    const key = `${row.traineeName}|${row.registrationNumber ?? ""}`;
    const list = scoreByTrainee.get(key) ?? [];
    list.push({ courseId: row.courseId, score: row.score });
    scoreByTrainee.set(key, list);
  }
  const assessments = [...scoreByTrainee.entries()].map(([key, scores]) => {
    const [traineeName, registrationNumber] = key.split("|");
    return { traineeName: traineeName ?? "", registrationNumber: registrationNumber || null, scores };
  });

  const present = presentCount[0]?.value ?? 0;
  const absent = absentCount[0]?.value ?? 0;
  const attendanceRate = present + absent === 0 ? null : Math.round((present / (present + absent)) * 100);

  return (
    <ReportsClient
      traineeStats={{
        total: totalTrainees[0]?.value ?? 0,
        active: activeTrainees[0]?.value ?? 0,
        inactive: inactiveTrainees[0]?.value ?? 0,
        pending: pendingTrainees[0]?.value ?? 0,
        genders: genderRows.map((row) => ({ gender: row.gender, count: row.value })),
      }}
      attendanceStats={{
        present,
        absent,
        rate: attendanceRate,
      }}
      assessmentAverages={assessmentAverages}
      trainees={traineeRows.map((row) => ({
        registrationNumber: row.registrationNumber,
        fullName: row.fullName,
        gender: row.gender,
        phone: row.phone,
        email: row.email,
        status: row.status,
      }))}
      attendance={attendanceRows.map((row) => ({
        date: row.date,
        traineeName: row.traineeName,
        registrationNumber: row.registrationNumber,
        status: row.status,
      }))}
      assessments={assessments}
    />
  );
}
