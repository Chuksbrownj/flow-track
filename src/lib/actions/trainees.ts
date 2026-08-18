"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { suspendRequests, trainees, users } from "@/db/schema";
import { requireMasterAdmin, requireStaff } from "@/lib/auth-guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordTraineeChange } from "@/lib/trainee-logs";
import { recordAudit } from "@/lib/audit";
import { isUuid, validatePassword, validateTrainee } from "@/lib/validation";
import { sendSuspendRequestNotice } from "@/lib/email";

export type ActionResult = { ok: boolean; error?: string; message?: string };

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
    email: value(formData, "email").toLowerCase(),
  };
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const validationError = validateTrainee(input);
  if (validationError) return { ok: false, error: validationError };

  // The password becomes the trainee's login credential (registration number
  // or email + this password), so it is required when an admin creates them.
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };
  if (password !== confirmPassword) return { ok: false, error: "Passwords do not match." };

  const registrationNumber = input.registrationNumber.toUpperCase();
  const [existing] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.registrationNumber, registrationNumber))
    .limit(1);
  if (existing) {
    return { ok: false, error: "A trainee with this registration number already exists." };
  }

  // The email must be unique across all accounts (staff and students).
  if (input.email) {
    const [emailCollision] = await db()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (emailCollision) {
      return { ok: false, error: "This email is already in use by another account." };
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let createdUserId: string | null = null;
  let createdId: string | null = null;
  try {
    // Create the login account first, then link the trainee record to it.
    const [createdUser] = await db()
      .insert(users)
      .values({
        name: input.fullName,
        email: input.email || null,
        passwordHash,
        role: "student",
      })
      .returning({ id: users.id });
    createdUserId = createdUser.id;

    const [created] = await db()
      .insert(trainees)
      .values({
        userId: createdUser.id,
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
    // Roll back the account if the trainee insert failed.
    if (createdUserId) {
      await db().delete(users).where(eq(users.id, createdUserId)).catch(() => {});
    }
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

/**
 * Master admin: suspend a trainee's account immediately (status → dormant).
 */
export async function suspendTrainee(id: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };
  if (trainee.status === "dormant") return { ok: false, error: "This account is already dormant." };

  try {
    await db().update(trainees).set({ status: "dormant", updatedAt: new Date() }).where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not suspend the account. Try again." };
  }

  await recordTraineeChange({
    traineeId: id,
    actorId: admin.id,
    actorName: admin.name ?? null,
    action: "status",
    field: "status",
    before: trainee.status,
    after: "dormant",
  });
  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "suspended",
    entityType: "trainee",
    entityId: id,
    summary: `Suspended ${trainee.fullName}'s account (dormant)`,
  });

  revalidatePath("/trainees");
  return { ok: true, message: `${trainee.fullName}'s account is now dormant.` };
}

/**
 * Master admin: restore a dormant account back to active.
 */
export async function restoreTrainee(id: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };
  if (trainee.status !== "dormant") return { ok: false, error: "Only dormant accounts can be restored." };

  try {
    await db().update(trainees).set({ status: "active", updatedAt: new Date() }).where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not restore the account. Try again." };
  }

  await recordTraineeChange({
    traineeId: id,
    actorId: admin.id,
    actorName: admin.name ?? null,
    action: "status",
    field: "status",
    before: "dormant",
    after: "active",
  });
  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "restored",
    entityType: "trainee",
    entityId: id,
    summary: `Restored ${trainee.fullName}'s account (active)`,
  });

  revalidatePath("/trainees");
  return { ok: true, message: `${trainee.fullName}'s account is active again.` };
}

/**
 * Admin (trainer): request suspension of a trainee. Goes into a Pending state
 * and notifies all master admins. Only takes effect once a master confirms.
 */
export async function requestSuspendTrainee(id: string, reason: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5) return { ok: false, error: "Please give a reason (at least 5 characters)." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };
  if (trainee.status === "dormant") return { ok: false, error: "This account is already dormant." };

  const [pending] = await db()
    .select({ id: suspendRequests.id })
    .from(suspendRequests)
    .where(and(eq(suspendRequests.traineeId, id), eq(suspendRequests.status, "pending")))
    .limit(1);
  if (pending) return { ok: false, error: "A suspension request for this trainee is already pending." };

  try {
    await db().insert(suspendRequests).values({
      traineeId: id,
      requestedById: staff.id,
      reason: trimmedReason,
      status: "pending",
    });
  } catch {
    return { ok: false, error: "Could not submit the request. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "suspend_requested",
    entityType: "trainee",
    entityId: id,
    summary: `${staff.name ?? "A trainer"} requested suspension of ${trainee.fullName} (${trimmedReason})`,
  });

  // Notify all master admins by email.
  const masterEmails = await db()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, "master_admin"));
  const recipients = masterEmails
    .map((row) => row.email)
    .filter((email): email is string => !!email);
  if (recipients.length > 0) {
    await sendSuspendRequestNotice(recipients, {
      traineeName: trainee.fullName,
      reason: trimmedReason,
      requestedBy: staff.name ?? "A trainer",
    });
  }

  revalidatePath("/trainees");
  return { ok: true, message: "Suspension request submitted for master admin approval." };
}

/** Master admin: confirm a pending suspension request (account becomes dormant). */
export async function confirmSuspendRequest(requestId: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(requestId)) return { ok: false, error: "Request not found." };

  const [request] = await db()
    .select()
    .from(suspendRequests)
    .where(eq(suspendRequests.id, requestId))
    .limit(1);
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") return { ok: false, error: "This request was already decided." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, request.traineeId))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };

  try {
    await db()
      .update(trainees)
      .set({ status: "dormant", updatedAt: new Date() })
      .where(eq(trainees.id, trainee.id));
    await db()
      .update(suspendRequests)
      .set({ status: "confirmed", decidedById: admin.id, decidedAt: new Date() })
      .where(eq(suspendRequests.id, requestId));
  } catch {
    return { ok: false, error: "Could not confirm the request. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "suspend_confirmed",
    entityType: "trainee",
    entityId: trainee.id,
    summary: `Confirmed suspension of ${trainee.fullName} (dormant)`,
  });

  revalidatePath("/trainees");
  return { ok: true, message: `${trainee.fullName}'s account is now dormant.` };
}

/** Master admin: reject a pending suspension request. */
export async function rejectSuspendRequest(requestId: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(requestId)) return { ok: false, error: "Request not found." };

  const [request] = await db()
    .select()
    .from(suspendRequests)
    .where(eq(suspendRequests.id, requestId))
    .limit(1);
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") return { ok: false, error: "This request was already decided." };

  try {
    await db()
      .update(suspendRequests)
      .set({ status: "rejected", decidedById: admin.id, decidedAt: new Date() })
      .where(eq(suspendRequests.id, requestId));
  } catch {
    return { ok: false, error: "Could not reject the request. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "suspend_rejected",
    entityType: "trainee",
    entityId: request.traineeId,
    summary: "Rejected a suspension request",
  });

  revalidatePath("/trainees");
  return { ok: true, message: "Request rejected. The trainee's account stays active." };
}

/**
 * Master admin: mark a trainee's account for permanent deletion. Identifying
 * details stay, but the record is flagged "deleted" and the underlying data is
 * purged after the 1-week grace period (see purgeDeletedTrainees).
 */
export async function markTraineeDeleted(id: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(id)) return { ok: false, error: "Trainee not found." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.id, id))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };
  if (trainee.status === "deleted") return { ok: false, error: "This account is already marked for deletion." };

  try {
    await db()
      .update(trainees)
      .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(trainees.id, id));
  } catch {
    return { ok: false, error: "Could not delete the account. Try again." };
  }

  // Logged now — the record's data will no longer exist after the grace period.
  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "deleted",
    entityType: "trainee",
    entityId: id,
    summary: `Marked ${trainee.fullName}'s account for permanent deletion (purged after 1 week)`,
  });
  await recordTraineeChange({
    traineeId: id,
    actorId: admin.id,
    actorName: admin.name ?? null,
    action: "status",
    field: "status",
    before: trainee.status,
    after: "deleted",
  });

  revalidatePath("/trainees");
  return { ok: true, message: `${trainee.fullName} marked for deletion. Data is purged after 1 week.` };
}

/**
 * Lazily purges trainee records (and their login accounts) that were marked
 * for deletion more than 1 week ago. Called from staff pages before reading
 * trainee data so the purge needs no cron service.
 */
export async function purgeDeletedTrainees(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const doomed = await db()
    .select({ id: trainees.id, userId: trainees.userId })
    .from(trainees)
    .where(and(eq(trainees.status, "deleted"), lt(trainees.deletedAt, cutoff)));
  if (doomed.length === 0) return 0;

  const ids = doomed.map((row) => row.id);
  const userIds = doomed.map((row) => row.userId).filter((value): value is string => !!value);
  try {
    // Attendance, scores and submissions cascade on trainee delete.
    await db().delete(trainees).where(inArray(trainees.id, ids));
    if (userIds.length > 0) {
      await db().delete(users).where(inArray(users.id, userIds)).catch(() => {});
    }
  } catch (error) {
    console.error("purgeDeletedTrainees: could not purge records", error);
    return 0;
  }
  return doomed.length;
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
