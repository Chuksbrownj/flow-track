"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { isValidEmail, validatePassword } from "@/lib/validation";
import { isValidTopic } from "@/lib/topics";
import { sendAccountCredentialsEmail } from "@/lib/email";

export type ActionResult = { ok: boolean; error?: string; message?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

const STAFF_ROLES = ["admin", "trainer"];

export async function createStaff(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

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
  if (input.role === "trainer" && !isValidTopic(input.topic)) {
    return { ok: false, error: "Please choose a valid topic for this trainer." };
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
      topic: input.role === "trainer" ? input.topic : null,
    });
  } catch {
    return { ok: false, error: "Could not create the staff account. Try again." };
  }

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
  const admin = await requireAdmin();

  const name = value(formData, "name");
  const role = value(formData, "role");
  const topic = value(formData, "topic");

  if (name.length < 3) return { ok: false, error: "Name is required (at least 3 characters)." };
  if (!STAFF_ROLES.includes(role)) return { ok: false, error: "Please choose a valid role." };
  if (role === "trainer" && !isValidTopic(topic)) {
    return { ok: false, error: "Please choose a valid topic for this trainer." };
  }

  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: "Staff account not found." };

  // The master admin cannot change their own role or leave the system without any admin.
  if (admin.id === target.id) {
    if (role !== target.role) return { ok: false, error: "You cannot change your own role." };
  }
  if (target.role === "admin" && role === "trainer") {
    const [adminCount] = await db()
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"));
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
        topic: role === "trainer" ? topic : null,
      })
      .where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not update the staff account. Try again." };
  }

  revalidatePath("/staff");
  return { ok: true };
}

export async function resetStaffPassword(userId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

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

  revalidatePath("/staff");
  return { ok: true };
}

export async function deleteStaff(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (admin.id === userId) return { ok: false, error: "You cannot delete your own account." };

  const [target] = await db()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "trainer")))
    .limit(1);
  if (!target) {
    return { ok: false, error: "Only trainer accounts can be deleted (admin accounts are protected)." };
  }

  try {
    await db().delete(users).where(eq(users.id, userId));
  } catch {
    return { ok: false, error: "Could not delete the trainer. Try again." };
  }

  revalidatePath("/staff");
  return { ok: true };
}
