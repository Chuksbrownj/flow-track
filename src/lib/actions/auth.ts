"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { validatePassword, validateSignup } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function logout() {
  const user = await requireUser().catch(() => null);
  const target = user?.role === "admin" ? "/admin/login" : "/login";
  await signOut({ redirectTo: target });
}

export async function registerTrainee(formData: FormData): Promise<ActionResult> {
  const input = {
    registrationNumber: value(formData, "registrationNumber").toUpperCase(),
    fullName: value(formData, "fullName"),
    email: value(formData, "email").toLowerCase(),
    phone: value(formData, "phone"),
    gender: value(formData, "gender"),
    password: String(formData.get("password") ?? ""),
  };
  const confirm = String(formData.get("confirmPassword") ?? "");

  const error = validateSignup(input);
  if (error) return { ok: false, error };
  if (input.password !== confirm) return { ok: false, error: "Passwords do not match." };

  const [existingUser] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  const [existingTraineeByEmail] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.email, input.email))
    .limit(1);
  const [existingRegistration] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.registrationNumber, input.registrationNumber))
    .limit(1);
  if (existingUser || existingTraineeByEmail) {
    return { ok: false, error: "An account with this email already exists." };
  }
  if (existingRegistration) {
    return { ok: false, error: "This registration number is already in use." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  let createdUserId: string | null = null;
  try {
    const [created] = await db()
      .insert(users)
      .values({
        name: input.fullName,
        email: input.email,
        passwordHash,
        role: "trainee",
      })
      .returning({ id: users.id });
    createdUserId = created.id;

    await db().insert(trainees).values({
      userId: created.id,
      registrationNumber: input.registrationNumber,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      gender: input.gender,
      status: "pending",
    });
  } catch {
    if (createdUserId) {
      await db().delete(users).where(eq(users.id, createdUserId)).catch(() => {});
    }
    return { ok: false, error: "Could not create your account. Try again." };
  }

  return { ok: true };
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current) return { ok: false, error: "Enter your current password." };
  const passwordError = validatePassword(next);
  if (passwordError) return { ok: false, error: passwordError };
  if (next !== confirm) return { ok: false, error: "New passwords do not match." };

  const [row] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) return { ok: false, error: "Account not found." };

  const valid = await bcrypt.compare(current, row.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  const unchanged = await bcrypt.compare(next, row.passwordHash);
  if (unchanged) return { ok: false, error: "New password must be different from the current one." };

  const passwordHash = await bcrypt.hash(next, 10);
  try {
    await db().update(users).set({ passwordHash }).where(eq(users.id, user.id));
  } catch {
    return { ok: false, error: "Could not update your password. Try again." };
  }

  const target = user.role === "admin" ? "/admin/login?changed=1" : "/login?changed=1";
  await signOut({ redirectTo: target });
  return { ok: true };
}
