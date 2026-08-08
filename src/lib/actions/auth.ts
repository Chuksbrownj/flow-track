"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signOut } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { validatePassword } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

export async function logout() {
  await signOut({ redirectTo: "/login" });
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

  await signOut({ redirectTo: "/login?changed=1" });
  return { ok: true };
}
