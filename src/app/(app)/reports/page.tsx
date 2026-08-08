import { asc, avg, count, desc, eq } from "drizzle-orm";
import { ReportsClient } from "@/components/reports/reports-client";
import { db } from "@/db/client";
import { assessments, attendance, trainees } from "@/db/schema";

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
  const database = db();

  const [
    totalTrainees,
    activeTrainees,
    inactiveTrainees,
    genderRows,
    presentCount,
    absentCount,
    averageRows,
    traineeRows,
    attendanceRows,
    assessmentRows,
  ] = await Promise.all([
    database.select({ value: count() }).from(trainees),
    database.select({ value: count() }).from(trainees).where(eq(trainees.status, "active")),
    database.select({ value: count() }).from(trainees).where(eq(trainees.status, "inactive")),
    database
      .select({ gender: trainees.gender, value: count() })
      .from(trainees)
      .groupBy(trainees.gender),
    database.select({ value: count() }).from(attendance).where(eq(attendance.status, "present")),
    database.select({ value: count() }).from(attendance).where(eq(attendance.status, "absent")),
    database
      .select({
        graphicDesign: avg(assessments.graphicDesign),
        animation: avg(assessments.animation),
        dataAnalysis: avg(assessments.dataAnalysis),
        hpLife: avg(assessments.hpLife),
      })
      .from(assessments),
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
        graphicDesign: assessments.graphicDesign,
        animation: assessments.animation,
        dataAnalysis: assessments.dataAnalysis,
        hpLife: assessments.hpLife,
      })
      .from(assessments)
      .innerJoin(trainees, eq(assessments.traineeId, trainees.id))
      .orderBy(asc(trainees.fullName)),
  ]);

  const averages = averageRows[0];
  const present = presentCount[0]?.value ?? 0;
  const absent = absentCount[0]?.value ?? 0;
  const attendanceRate = present + absent === 0 ? null : Math.round((present / (present + absent)) * 100);

  return (
    <ReportsClient
      traineeStats={{
        total: totalTrainees[0]?.value ?? 0,
        active: activeTrainees[0]?.value ?? 0,
        inactive: inactiveTrainees[0]?.value ?? 0,
        genders: genderRows.map((row) => ({ gender: row.gender, count: row.value })),
      }}
      attendanceStats={{
        present,
        absent,
        rate: attendanceRate,
      }}
      assessmentAverages={{
        graphicDesign: toAverage(averages?.graphicDesign ?? null),
        animation: toAverage(averages?.animation ?? null),
        dataAnalysis: toAverage(averages?.dataAnalysis ?? null),
        hpLife: toAverage(averages?.hpLife ?? null),
      }}
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
      assessments={assessmentRows.map((row) => ({
        traineeName: row.traineeName,
        registrationNumber: row.registrationNumber,
        graphicDesign: row.graphicDesign,
        animation: row.animation,
        dataAnalysis: row.dataAnalysis,
        hpLife: row.hpLife,
      }))}
    />
  );
}
