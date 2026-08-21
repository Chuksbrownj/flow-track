"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainingSchedule } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { isUuid, validateSchedule } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

import { value, type ActionResult } from "@/lib/actions/utils";

export type { ActionResult };

function parseInput(formData: FormData) {
  return {
    error: null,
    input: {
      title: value(formData, "title"),
      programme: value(formData, "programme"),
      date: value(formData, "date"),
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime"),
      description: value(formData, "description"),
    },
  };
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();

  const parsed = parseInput(formData);
  if (parsed.error) return { ok: false, error: parsed.error };
  const input = parsed.input!;

  const error = validateSchedule(input);
  if (error) return { ok: false, error };

  try {
    await db().insert(trainingSchedule).values({
      title: input.title,
      programme: input.programme,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      description: input.description || null,
    });
  } catch {
    return { ok: false, error: "Could not create the session. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "created",
    entityType: "schedule",
    summary: `Scheduled “${input.title}” on ${input.date}`,
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateSession(id: string, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Session not found." };

  const parsed = parseInput(formData);
  if (parsed.error) return { ok: false, error: parsed.error };
  const input = parsed.input!;

  const error = validateSchedule(input);
  if (error) return { ok: false, error };

  try {
    await db()
      .update(trainingSchedule)
      .set({
        title: input.title,
        programme: input.programme,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        description: input.description || null,
      })
      .where(eq(trainingSchedule.id, id));
  } catch {
    return { ok: false, error: "Could not update the session. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "updated",
    entityType: "schedule",
    entityId: id,
    summary: `Updated session “${input.title}”`,
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Session not found." };

  try {
    await db().delete(trainingSchedule).where(eq(trainingSchedule.id, id));
  } catch {
    return { ok: false, error: "Could not delete the session. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "deleted",
    entityType: "schedule",
    entityId: id,
    summary: "Deleted a scheduled training session",
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}
