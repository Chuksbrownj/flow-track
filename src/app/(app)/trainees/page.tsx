import { asc } from "drizzle-orm";
import { TraineesClient } from "@/components/trainees/trainees-client";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";

export const metadata = { title: "Trainees" };

export default async function TraineesPage() {
  await requireAdmin();
  const rows = await db().select().from(trainees).orderBy(asc(trainees.createdAt));

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

  return <TraineesClient initialTrainees={traineeList} />;
}
