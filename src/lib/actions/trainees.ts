"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { validateTrainee } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createTrainee(formData: FormData): Promise<ActionResult> {
  await requireUser();

  const input = {
    registrationNumber: value(formData, "registrationNumber"),
    fullName: value(formData, "fullName"),
    gender: value(formData, "gender"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
  };

  const validationError = validateTrainee(input);
  if (validationError) return { ok: false, error: validationError };

  const registrationNumber = input.registrationNumber.toUpperCase();
  const [existing] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.registrationNumber, registrationNumber))
    .limit(1);
  if (existing) {
    return { ok: false, error: "A trainee with this registration number already exists." };
  }

  try {
    await db().insert(trainees).values({
      registrationNumber,
      fullName: input.fullName,
      gender: input.gender,
      phone: input.phone,
      email: input.email || null,
      status: "active",
    });
  } catch {
    return { ok: false, error: "A trainee with this registration number already exists." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTrainee(id: string, formData: FormData): Promise<ActionResult> {
  await requireUser();

  const input = {
    registrationNumber: value(formData, "registrationNumber"),
    fullName: value(formData, "fullName"),
    gender: value(formData, "gender"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
  };

  const validationError = validateTrainee(input);
  if (validationError) return { ok: false, error: validationError };

  const registrationNumber = input.registrationNumber.toUpperCase();
  const [duplicate] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.registrationNumber, registrationNumber))
    .limit(1);
  if (duplicate && duplicate.id !== id) {
    return { ok: false, error: "A trainee with this registration number already exists." };
  }

  try {
    await db()
      .update(trainees)
      .set({
        registrationNumber,
        fullName: input.fullName,
        gender: input.gender,
        phone: input.phone,
        email: input.email || null,
        updatedAt: new Date(),
      })
      .where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "A trainee with this registration number already exists." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setTraineeStatus(
  id: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  await requireUser();

  await db()
    .update(trainees)
    .set({ status, updatedAt: new Date() })
    .where(eq(trainees.id, id));

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}
