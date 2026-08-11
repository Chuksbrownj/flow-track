import { asc, eq } from "drizzle-orm";
import { TraineesClient } from "@/components/trainees/trainees-client";
import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { suspendRequests, trainees } from "@/db/schema";
import { listTraineeLogs } from "@/lib/trainee-logs";

export const metadata = { title: "Trainees" };

export default async function TraineesPage() {
  const user = await requireStaff();
  const isMaster = user.role === "master_admin";

  // Records marked for deletion are purged by the daily cron job
  // (src/app/api/cron/purge) — no lazy purge on page load.
  const [rows, changeLogs, requestRows] = await Promise.all([
    db().select().from(trainees).orderBy(asc(trainees.createdAt)),
    isMaster ? listTraineeLogs() : Promise.resolve([]),
    isMaster
      ? db()
          .select()
          .from(suspendRequests)
          .where(eq(suspendRequests.status, "pending"))
          .orderBy(asc(suspendRequests.createdAt))
      : Promise.resolve([]),
  ]);

  const traineeList = rows.map((trainee) => ({
    id: trainee.id,
    registrationNumber: trainee.registrationNumber,
    fullName: trainee.fullName,
    gender: trainee.gender,
    phone: trainee.phone,
    email: trainee.email,
    status: trainee.status,
    createdAt: trainee.createdAt.toISOString(),
    hasDevice: !!trainee.deviceFingerprint,
  }));

  return (
    <TraineesClient
      initialTrainees={traineeList}
      isMaster={isMaster}
      changeLogs={changeLogs}
      suspendRequests={requestRows.map((row) => ({
        id: row.id,
        traineeId: row.traineeId,
        reason: row.reason ?? "",
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
