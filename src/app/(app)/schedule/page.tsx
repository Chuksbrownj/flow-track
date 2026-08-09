import { asc } from "drizzle-orm";
import { ScheduleClient } from "@/components/schedule/schedule-client";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { trainingSchedule } from "@/db/schema";

export const metadata = { title: "Training Schedule" };

export default async function SchedulePage() {
  const user = await requireUser();
  const readOnly = user.role === "student";

  const rows = await db()
    .select()
    .from(trainingSchedule)
    .orderBy(asc(trainingSchedule.date), asc(trainingSchedule.startTime));

  const sessions = rows.map((session) => ({
    id: session.id,
    title: session.title,
    programme: session.programme,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    description: session.description,
    googleFormUrl: session.googleFormUrl,
  }));

  return <ScheduleClient initialSessions={sessions} readOnly={readOnly} />;
}
