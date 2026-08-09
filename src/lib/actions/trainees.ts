"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";
import { requireMasterAdmin, requireStaff } from "@/lib/auth-guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordTraineeChange } from "@/lib/trainee-logs";
import { recordAudit } from "@/lib/audit";
import { isUuid, validatePassword, validateTrainee } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createTrainee(formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();

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

  let createdId: string | null = null;
  try {
    const [created] = await db()
      .insert(trainees)
      .values({
        registrationNumber,
        fullName: input.fullName,
        gender: input.gender,
        phone: input.phone,
        email: input.email || null,
        status: "active",
      })
      .returning({ id: trainees.id });
    createdId = created.id;
  } catch {
    return { ok: false, error: "Could not add the trainee. Try again." };
  }

  if (createdId) {
    await recordTraineeChange({
      traineeId: createdId,
      actorId: staff.id,
      actorName: staff.name ?? null,
      action: "created",
    });
    await recordAudit({
      actorId: staff.id,
      actorName: staff.name ?? null,
      actorRole: staff.role,
      action: "created",
      entityType: "trainee",
      entityId: createdId,
      summary: `Added trainee ${input.fullName} (${registrationNumber})`,
    });
  }

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTrainee(
  id: string,
  masterPassword: string,
  formData: FormData
): Promise<ActionResult> {
  // Only the master admin can change a trainee's registration details, and
  // every change must be confirmed with the master admin's password.
  const admin = await requireMasterAdmin();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

  // Throttle password attempts on this sensitive action.
  const [byUser, byIp] = await Promise.all([
    rateLimit(`admin-edit:user:${admin.id}`, 10, 15 * 60 * 1000),
    rateLimit(`admin-edit:ip:${await clientIp()}`, 30, 15 * 60 * 1000),
  ]);
  if (!byUser.ok || !byIp.ok) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  if (!masterPassword) {
    return { ok: false, error: "Enter the master admin password to confirm these changes." };
  }

  const [adminRow] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, admin.id))
    .limit(1);
  if (!adminRow) return { ok: false, error: "Could not verify your password. Try again." };

  const valid = await bcrypt.compare(masterPassword, adminRow.passwordHash);
  if (!valid) return { ok: false, error: "Incorrect master admin password. Changes were not saved." };

  const input = {
    registrationNumber: value(formData, "registrationNumber"),
    fullName: value(formData, "fullName"),
    gender: value(formData, "gender"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
  };

  const [existing] = await db()
    .select()
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

  // Log each changed field so the history shows exactly what changed and when.
  const changes: { field: string; before: string | null; after: string | null }[] = [
    {
      field: "registrationNumber",
      before: existing.registrationNumber,
      after: registrationNumber,
    },
    { field: "fullName", before: existing.fullName, after: input.fullName },
    { field: "gender", before: existing.gender, after: input.gender },
    { field: "phone", before: existing.phone, after: input.phone },
    { field: "email", before: existing.email, after: input.email || null },
  ].filter((change) => change.before !== change.after);

  await Promise.all(
    changes.map((change) =>
      recordTraineeChange({
        traineeId: id,
        actorId: admin.id,
        actorName: admin.name ?? null,
        action: "updated",
        field: change.field,
        before: change.before,
        after: change.after,
      })
    )
  );

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "updated",
    entityType: "trainee",
    entityId: id,
    summary: `Updated ${existing.fullName}'s registration details (${changes.length} field${changes.length === 1 ? "" : "s"} changed)`,
  });

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}

export async function setTraineeStatus(
  id: string,
  status: "active" | "inactive"
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

  if (status !== "active" && status !== "inactive") {
    return { ok: false, error: "Invalid status." };
  }

  const [existing] = await db()
    .select({ id: trainees.id, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Trainee not found." };
  if (existing.status === status) return { ok: true };

  try {
    await db()
      .update(trainees)
      .set({ status, updatedAt: new Date() })
      .where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not update the trainee. Try again." };
  }

  await recordTraineeChange({
    traineeId: id,
    actorId: staff.id,
    actorName: staff.name ?? null,
    action: "status",
    field: "status",
    before: existing.status,
    after: status,
  });

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "status",
    entityType: "trainee",
    entityId: id,
    summary: `${existing.status === "active" ? "Deactivated" : "Activated"} trainee`,
  });

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

/**
 * Staff reset of a student's password (fallback for students who never add an
 * email to their profile and so cannot use the self-service reset).
 */
export async function resetStudentPassword(
  traineeId: string,
  password: string
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(traineeId)) return { ok: false, error: "Trainee not found." };

  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  const [trainee] = await db()
    .select({ id: trainees.id, userId: trainees.userId, fullName: trainees.fullName })
    .from(trainees)
    .where(eq(trainees.id, traineeId))
    .limit(1);
  if (!trainee?.userId) {
    return { ok: false, error: "No sign-in account is linked to this trainee." };
  }

  try {
    await db()
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, trainee.userId));
  } catch {
    return { ok: false, error: "Could not reset the password. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "password_reset",
    entityType: "trainee",
    entityId: traineeId,
    summary: `Reset the password for ${trainee.fullName}`,
  });

  revalidatePath("/trainees");
  return { ok: true };
}

export async function approveTrainee(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

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

  await recordTraineeChange({
    traineeId: id,
    actorId: staff.id,
    actorName: staff.name ?? null,
    action: "approved",
    field: "status",
    before: "pending",
    after: "active",
  });
  if (trainee.registrationNumber !== registrationNumber) {
    await recordTraineeChange({
      traineeId: id,
      actorId: staff.id,
      actorName: staff.name ?? null,
      action: "updated",
      field: "registrationNumber",
      before: trainee.registrationNumber,
      after: registrationNumber,
    });
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "approved",
    entityType: "trainee",
    entityId: id,
    summary: `Approved trainee registration`,
  });

  revalidatePath("/trainees");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
