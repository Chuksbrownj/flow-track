"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireMasterAdmin } from "@/lib/auth-guard";
import { isValidEmail, validatePassword } from "@/lib/validation";
import { isValidCourse } from "@/lib/courses";
import { isUuid } from "@/lib/validation";
import { sendAccountCredentialsEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

import { value, type ActionResult } from "@/lib/actions/utils";

/** Staff roles: admin (trainer) and master_admin. */
const STAFF_ROLES = ["admin", "master_admin"];

export async function createStaff(formData: FormData): Promise<ActionResult> {
  const admin = await requireMasterAdmin();

  const input = {
    name: value(formData, "name"),
    email: value(formData, "email").toLowerCase(),
    role: value(formData, "role"),
    topic: value(formData, "topic"),
    password: String(formData.get("password") ?? ""),
  };

  if (input.name.length < 3) return { ok: false, error: "Name is required (at least 3 characters)." };
  if (!isValidEmail(input.email)) return { ok: false, error: "Please enter a valid email address." };
  if (!STAFF_ROLES.includes(input.role)) return { ok: false, error: "Please choose a valid role." };
  // Admins (and master admins acting as trainers) pick their own course on
  // first login, so the topic is optional here.
  if (input.topic && !(await isValidCourse(input.topic))) {
    return { ok: false, error: "Please choose a valid course." };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const [existing] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) return { ok: false, error: "A user with this email already exists." };

  try {
    await db().insert(users).values({
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: input.role,
      topic: input.topic || null,
    });
  } catch {
    return { ok: false, error: "Could not create the staff account. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "created",
    entityType: "staff",
    summary: `Created ${input.role === "master_admin" ? "master admin" : "admin"} account ${input.name} (${input.email})`,
  });

  // Let the new staff member know their login details.
  let sent = false;
  try {
    sent = await sendAccountCredentialsEmail(input.email, input.name, input.email, input.password);
  } catch (error) {
    console.error("Could not email staff credentials:", error);
  }

  revalidatePath("/staff");
  if (!sent) {
    return {
      ok: true,
      message: "Account created, but the credentials email could not be sent. Share the password manually.",
    };
  }
  return { ok: true };
}

export async function updateStaff(userId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(userId)) return { ok: false, error: "Staff account not found." };

  const name = value(formData, "name");
  const role = value(formData, "role");
  const topic = value(formData, "topic");

  if (name.length < 3) return { ok: false, error: "Name is required (at least 3 characters)." };
  if (!STAFF_ROLES.includes(role)) return { ok: false, error: "Please choose a valid role." };
  if (topic && !(await isValidCourse(topic))) {
    return { ok: false, error: "Please choose a valid course." };
  }

  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: "Staff account not found." };

  // The master admin cannot change their own role or leave the system without any master admin.
  if (admin.id === target.id) {
    if (role !== target.role) return { ok: false, error: "You cannot change your own role." };
  }
  if (target.role === "master_admin" && role === "admin") {
    const [adminCount] = await db()
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "master_admin"));
    if ((adminCount?.value ?? 0) <= 1) {
      return { ok: false, error: "At least one master admin must remain." };
    }
  }

  try {
    await db()
      .update(users)
      .set({
        name,
        role,
        topic: topic || null,
      })
      .where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not update the staff account. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "updated",
    entityType: "staff",
    entityId: userId,
    summary: `Updated ${target.name}'s account (role: ${target.role} → ${role})`,
  });

  revalidatePath("/staff");
  return { ok: true };
}

/** Master admin promotes an admin (trainer) to master admin. */
export async function promoteToMasterAdmin(userId: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(userId)) return { ok: false, error: "Staff account not found." };
  if (admin.id === userId) return { ok: false, error: "You are already a master admin." };

  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: "Staff account not found." };
  if (target.role !== "admin") {
    return { ok: false, error: "Only admins (trainers) can be promoted to master admin." };
  }

  try {
    // A master admin can keep their trainer course (Update 15) — the topic is
    // not cleared on promotion.
    await db().update(users).set({ role: "master_admin" }).where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not promote this admin. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "role_promoted",
    entityType: "staff",
    entityId: userId,
    summary: `Promoted ${target.name} from admin to master admin`,
  });

  revalidatePath("/staff");
  return { ok: true, message: `${target.name} is now a master admin.` };
}

export async function resetStaffPassword(userId: string, formData: FormData): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(userId)) return { ok: false, error: "Staff account not found." };

  const password = String(formData.get("password") ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };

  try {
    await db()
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not reset the password. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "password_reset",
    entityType: "staff",
    entityId: userId,
    summary: "Reset a staff member's password",
  });

  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteStaff(userId: string): Promise<ActionResult> {
  const admin = await requireMasterAdmin();
  if (!isUuid(userId)) return { ok: false, error: "Staff account not found." };

  if (admin.id === userId) return { ok: false, error: "You cannot delete your own account." };

  const [target] = await db()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "admin")))
    .limit(1);
  if (!target) {
    return { ok: false, error: "Only admin accounts can be deleted (master admin accounts are protected)." };
  }

  try {
    await db().delete(users).where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not delete the admin. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "deleted",
    entityType: "staff",
    entityId: userId,
    summary: `Deleted admin account ${target.name}`,
  });

  revalidatePath("/staff");
  return { ok: true };
}
