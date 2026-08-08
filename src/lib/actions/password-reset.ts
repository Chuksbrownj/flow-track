"use server";

import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { passwordResetTokens, users } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { isValidEmail, validatePassword } from "@/lib/validation";

export type ResetResult = { ok: boolean; error?: string; staff?: boolean };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(
  _prevState: ResetResult | undefined,
  formData: FormData
): Promise<ResetResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };

  const [user] = await db().select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);

  // Always report success to avoid revealing whether an account exists.
  if (!user) return { ok: true };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db().delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db().insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  const origin =
    process.env.APP_URL ??
    `${(await headers()).get("x-forwarded-proto") ?? "http"}://${(await headers()).get("host") ?? "localhost:3000"}`;
  await sendPasswordResetEmail(user.email, `${origin}/reset-password?token=${token}`);

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

  const isStaff = user?.role === "admin" || user?.role === "trainer";
  return { ok: true, staff: isStaff };
}
