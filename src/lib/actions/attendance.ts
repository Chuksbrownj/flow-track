"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { todayStr } from "@/lib/date";

export type ActionResult = { ok: boolean; error?: string };

function validDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayStr();
}

export async function markAttendance(
  traineeId: string,
  status: "present" | "absent",
  date?: string
): Promise<ActionResult> {
  await requireAdmin();

  if (status !== "present" && status !== "absent") {
    return { ok: false, error: "Invalid status." };
  }

  const day = validDate(date);

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(and(eq(trainees.id, traineeId), eq(trainees.status, "active")))
    .limit(1);
  if (!trainee) {
    return { ok: false, error: "Trainee not found or inactive." };
  }

  try {
    const [existing] = await db()
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.traineeId, traineeId), eq(attendance.date, day)))
      .limit(1);

    if (existing) {
      await db().update(attendance).set({ status }).where(eq(attendance.id, existing.id));
    } else {
      await db().insert(attendance).values({ traineeId, date: day, status });
    }
  } catch {
    return { ok: false, error: "Could not save attendance. Try again." };
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
