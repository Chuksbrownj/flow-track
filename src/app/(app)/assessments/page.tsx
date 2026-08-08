import { asc } from "drizzle-orm";
import { AssessmentsClient } from "@/components/assessments/assessments-client";
import { db } from "@/db/client";
import { assessments, trainees } from "@/db/schema";

export const metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  const database = db();

  const [traineeRows, assessmentRows] = await Promise.all([
    database
      .select({
        id: trainees.id,
        registrationNumber: trainees.registrationNumber,
        fullName: trainees.fullName,
        status: trainees.status,
      })
      .from(trainees)
      .orderBy(asc(trainees.fullName)),
    database
      .select({
        traineeId: assessments.traineeId,
        graphicDesign: assessments.graphicDesign,
        animation: assessments.animation,
        dataAnalysis: assessments.dataAnalysis,
        hpLife: assessments.hpLife,
      })
      .from(assessments),
  ]);

  return (
    <AssessmentsClient
      trainees={traineeRows}
      initialAssessments={assessmentRows.map((row) => ({
        traineeId: row.traineeId,
        graphicDesign: row.graphicDesign,
        animation: row.animation,
        dataAnalysis: row.dataAnalysis,
        hpLife: row.hpLife,
      }))}
    />
  );
}
