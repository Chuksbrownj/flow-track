import { asc } from "drizzle-orm";
import { TraineesClient } from "@/components/trainees/trainees-client";
import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { listTraineeLogs } from "@/lib/trainee-logs";

export const metadata = { title: "Trainees" };

export default async function TraineesPage() {
  const user = await requireStaff();
  const isAdmin = user.role === "master_admin";

  const [rows, changeLogs] = await Promise.all([
    db().select().from(trainees).orderBy(asc(trainees.createdAt)),
    isAdmin ? listTraineeLogs() : Promise.resolve([]),
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

  return <TraineesClient initialTrainees={traineeList} isAdmin={isAdmin} changeLogs={changeLogs} />;
}
