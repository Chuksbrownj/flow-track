"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { validateTrainee } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createTrainee(formData: FormData): Promise<ActionResult> {
  await requireStaff();

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
    return { ok: false, error: "Could not add the trainee. Try again." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTrainee(id: string, formData: FormData): Promise<ActionResult> {
  await requireStaff();

  const input = {
    registrationNumber: value(formData, "registrationNumber"),
    fullName: value(formData, "fullName"),
    gender: value(formData, "gender"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
  };

  const [existing] = await db()
    .select({
      id: trainees.id,
      status: trainees.status,
      registrationNumber: trainees.registrationNumber,
    })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Trainee not found." };

  const isPending = existing.status === "pending";
  const validationError = isPending
    ? validateTrainee({ ...input, registrationNumber: "PENDING-EDIT" })
    : validateTrainee(input);
  if (validationError) return { ok: false, error: validationError };

  const registrationNumber = input.registrationNumber
    ? input.registrationNumber.toUpperCase()
    : existing.registrationNumber;

  if (registrationNumber) {
    const [duplicate] = await db()
      .select({ id: trainees.id })
      .from(trainees)
      .where(eq(trainees.registrationNumber, registrationNumber))
      .limit(1);
    if (duplicate && duplicate.id !== id) {
      return { ok: false, error: "A trainee with this registration number already exists." };
    }
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
    return { ok: false, error: "Could not update the trainee. Try again." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}

export async function setTraineeStatus(
  id: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  await requireStaff();

  if (status !== "active" && status !== "inactive") {
    return { ok: false, error: "Invalid status." };
  }

  try {
    await db()
      .update(trainees)
      .set({ status, updatedAt: new Date() })
      .where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not update the trainee. Try again." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}

async function nextRegistrationNumber(): Promise<string> {
  const rows = await db().select({ registrationNumber: trainees.registrationNumber }).from(trainees);
  let max = 0;
  for (const row of rows) {
    if (!row.registrationNumber) continue;
    const match = /^OYA-(\d+)$/i.exec(row.registrationNumber);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `OYA-${String(max + 1).padStart(4, "0")}`;
}

export async function approveTrainee(id: string): Promise<ActionResult> {
  await requireStaff();

  const [trainee] = await db()
    .select({ id: trainees.id, status: trainees.status, registrationNumber: trainees.registrationNumber })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };
  if (trainee.status !== "pending") return { ok: false, error: "Only pending trainees can be approved." };

  const registrationNumber = trainee.registrationNumber ?? (await nextRegistrationNumber());
  try {
    await db()
      .update(trainees)
      .set({ status: "active", registrationNumber, updatedAt: new Date() })
      .where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not approve the trainee. Try again." };
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
