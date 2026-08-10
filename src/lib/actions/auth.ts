"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { validatePassword, validateSignup } from "@/lib/validation";

export type ActionResult = {
  ok: boolean;
  error?: string;
  /** True when the registration code belongs to a deleted record — show the Contact-Admin prompt. */
  blocked?: boolean;
};

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function logout() {
  const user = await requireUser().catch(() => null);
  const target =
    user?.role === "master_admin" || user?.role === "admin" ? "/admin/login" : "/login";
  await signOut({ redirectTo: target });
}

const REGISTER_IP_LIMIT = 50; // signups per IP per hour (shared campus networks are normal)
const REGISTER_CODE_LIMIT = 3; // signups per registration code per hour
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function registerTrainee(formData: FormData): Promise<ActionResult> {
  const input = {
    registrationNumber: value(formData, "registrationNumber"),
    fullName: value(formData, "fullName"),
    gender: value(formData, "gender"),
    email: value(formData, "email").toLowerCase(),
    phone: value(formData, "phone"),
    password: String(formData.get("password") ?? ""),
  };
  const confirm = String(formData.get("confirmPassword") ?? "");

  const registrationCode = input.registrationNumber.toUpperCase();
  const ip = await clientIp();
  const [byIp, byCode] = await Promise.all([
    rateLimit(`register:ip:${ip}`, REGISTER_IP_LIMIT, REGISTER_WINDOW_MS),
    registrationCode
      ? rateLimit(`register:code:${registrationCode}`, REGISTER_CODE_LIMIT, REGISTER_WINDOW_MS)
      : { ok: true },
  ]);
  if (!byIp.ok || !byCode.ok) {
    return {
      ok: false,
      error: "Too many sign-up attempts. Please wait a while and try again.",
    };
  }

  const error = validateSignup(input);
  if (error) return { ok: false, error };
  if (input.password !== confirm) return { ok: false, error: "Passwords do not match." };

  const [existingRegistration] = await db()
    .select({ id: trainees.id, status: trainees.status })
    .from(trainees)
    .where(eq(trainees.registrationNumber, registrationCode))
    .limit(1);
  if (existingRegistration) {
    // A record marked for deletion keeps its identifying details so we can
    // block re-registration and route the person to the support desk.
    if (existingRegistration.status === "deleted") {
      return {
        ok: false,
        blocked: true,
        error:
          "This registration code belongs to a deleted record. Contact admin for help re-registering.",
      };
    }
    return { ok: false, error: "This registration code is already in use." };
  }

  // The email must be unique across users (staff and students).
  const [emailCollision] = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (emailCollision) {
    return { ok: false, error: "This email is already in use by another account." };
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
        role: "student",
      })
      .returning({ id: users.id });
    createdUserId = created.id;

    await db().insert(trainees).values({
      userId: created.id,
      registrationNumber: registrationCode,
      fullName: input.fullName,
      gender: input.gender,
      phone: input.phone,
      email: input.email,
      status: "pending",
    });

    await recordAudit({
      actorId: created.id,
      actorName: input.fullName,
      actorRole: "student",
      action: "created",
      entityType: "trainee",
      summary: `${input.fullName} registered with code ${registrationCode} (pending approval)`,
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

  await recordAudit({
    actorId: user.id,
    actorName: user.name ?? null,
    actorRole: user.role,
    action: "password_reset",
    entityType: "auth",
    summary: "Changed their own password",
  });

  const isStaff = user.role === "master_admin" || user.role === "admin";
  const target = isStaff ? "/admin/login?changed=1" : "/login?changed=1";
  await signOut({ redirectTo: target });
  return { ok: true };
}
