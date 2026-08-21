import { asc, avg, count, eq } from "drizzle-orm";
import { ReportsClient } from "@/components/reports/reports-client";
import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { assessmentScores, trainees } from "@/db/schema";
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
    averageRows,
    traineeRows,
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

  // Group score rows per trainee (one row per trainee in the report table).
  const scoreByTrainee = new Map<string, { courseId: string; score: number }[]>();
  for (const row of scoreRows) {
    const key = `${row.traineeName}|${row.registrationNumber ?? ""}`;
    const list = scoreByTrainee.get(key) ?? [];
    list.push({ courseId: row.courseId, score: row.score });
    scoreByTrainee.set(key, list);
  }

  return (
    <ReportsClient
      traineeStats={{
        total: totalTrainees[0]?.value ?? 0,
        active: activeTrainees[0]?.value ?? 0,
        inactive: inactiveTrainees[0]?.value ?? 0,
        pending: pendingTrainees[0]?.value ?? 0,
        genders: genderRows.map((row) => ({ gender: row.gender, count: row.value })),
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
    />
  );
}
