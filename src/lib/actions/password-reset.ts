"use server";

import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { passwordResetTokens, trainees, users } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isValidEmail, validatePassword } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export type ResetResult = { ok: boolean; error?: string; staff?: boolean };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const RESET_EMAIL_LIMIT = 3; // requests per email per hour
const RESET_IP_LIMIT = 10; // requests per IP per hour
const RESET_WINDOW_MS = 60 * 60 * 1000;

export async function requestPasswordReset(
  _prevState: ResetResult | undefined,
  formData: FormData
): Promise<ResetResult> {
  // Accept either an email (staff or student with email on file) or a
  // student's registration code.
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { ok: false, error: "Enter your email or registration code." };

  const isEmail = identifier.includes("@");
  if (isEmail && !isValidEmail(identifier)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const ip = await clientIp();
  const [byKey, byIp] = await Promise.all([
    rateLimit(`reset:key:${identifier.toLowerCase()}`, RESET_EMAIL_LIMIT, RESET_WINDOW_MS),
    rateLimit(`reset:ip:${ip}`, RESET_IP_LIMIT, RESET_WINDOW_MS),
  ]);
  if (!byKey.ok || !byIp.ok) {
    const limited = !byKey.ok ? byKey : byIp;
    return {
      ok: false,
      error: `Too many reset requests. Try again in ${Math.ceil((limited.retryAfterSeconds ?? 3600) / 60)} minute(s).`,
    };
  }

  let user: { id: string; email: string | null; name: string; role: string } | undefined;
  if (isEmail) {
    const [row] = await db()
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.email, identifier.toLowerCase()))
      .limit(1);
    user = row;
  } else {
    // Registration code → the linked student account.
    const [trainee] = await db()
      .select({ userId: trainees.userId, fullName: trainees.fullName })
      .from(trainees)
      .where(eq(trainees.registrationNumber, identifier.toUpperCase()))
      .limit(1);
    if (trainee?.userId) {
      const [row] = await db()
        .select({ id: users.id, email: users.email, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, trainee.userId))
        .limit(1);
      if (row) user = { ...row, name: trainee.fullName };
    }
  }

  // A student found by registration code but with no email on file cannot
  // receive a reset link — tell them to contact a trainer (the user chose this
  // explicit message over generic success for this case).
  if (user && !user.email) {
    return {
      ok: false,
      error: "No email is linked to this registration code yet. Add one from your profile, or ask a trainer to reset your password.",
    };
  }

  // Always report success otherwise, to avoid revealing whether an account exists.
  if (!user) return { ok: true };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db().delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db().insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  const origin =
    process.env.APP_URL ??
    `${(await headers()).get("x-forwarded-proto") ?? "http"}://${(await headers()).get("host") ?? "localhost:3000"}`;
  await sendPasswordResetEmail(user.email ?? "", `${origin}/reset-password?token=${token}`);

  await recordAudit({
    actorId: user.id,
    actorName: user.name ?? null,
    actorRole: user.role,
    action: "password_reset",
    entityType: "auth",
    summary: "Requested a password reset link",
  });

  return { ok: true };
}

export async function resetPassword(
  _prevState: ResetResult | undefined,
  formData: FormData
): Promise<ResetResult> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) return { ok: false, error: "This reset link is invalid or has expired." };
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: passwordError };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };

  const [row] = await db()
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const [user] = await db()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  const passwordHash = await bcrypt.hash(password, 10);
  await db().update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db()
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, row.userId), gt(passwordResetTokens.expiresAt, new Date())));

  const isStaff = user?.role === "master_admin" || user?.role === "admin";
  return { ok: true, staff: isStaff };
}
