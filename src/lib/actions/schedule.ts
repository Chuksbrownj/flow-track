"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainingSchedule } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { validateSchedule } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const input = {
    title: value(formData, "title"),
    programme: value(formData, "programme"),
    date: value(formData, "date"),
    startTime: value(formData, "startTime"),
    endTime: value(formData, "endTime"),
    description: value(formData, "description"),
  };

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

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateSession(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const input = {
    title: value(formData, "title"),
    programme: value(formData, "programme"),
    date: value(formData, "date"),
    startTime: value(formData, "startTime"),
    endTime: value(formData, "endTime"),
    description: value(formData, "description"),
  };

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

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  await requireAdmin();

  try {
    await db().delete(trainingSchedule).where(eq(trainingSchedule.id, id));
  } catch {
    return { ok: false, error: "Could not delete the session. Try again." };
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true };
}
