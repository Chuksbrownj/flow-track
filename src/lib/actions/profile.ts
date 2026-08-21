"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isValidEmail, PHONE_PATTERN } from "@/lib/validation";
import { type ActionResult } from "@/lib/actions/utils";

export type ContactDetails = { email: string | null; phone: string | null };

export async function getContactDetails(): Promise<ContactDetails> {
  const user = await requireUser();
  if (user.role === "master_admin" || user.role === "admin") return { email: null, phone: null };

  const [trainee] = await db()
    .select({ email: trainees.email, phone: trainees.phone })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);

  return { email: trainee?.email ?? null, phone: trainee?.phone ?? null };
}

/**
 * Students update their own email and phone number from their profile.
 * Registration code and name are locked and cannot be changed here.
 */
export async function updateContactDetails(input: {
  email: string;
  phone: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role === "master_admin" || user.role === "admin") {
    return { ok: false, error: "Only students can update their contact details here." };
  }

  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (email && !isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!phone || phone.length < 7 || phone.length > 20 || !PHONE_PATTERN.test(phone)) {
    return { ok: false, error: "Please enter a valid phone number." };
  }

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName, email: trainees.email, phone: trainees.phone })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };

  // Guard against email collisions with staff accounts or other students.
  if (email) {
    const [collision] = await db()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (collision && collision.id !== user.id) {
      return { ok: false, error: "This email is already in use by another account." };
    }
  }

  try {
    await db()
      .update(trainees)
      .set({ email: email || null, phone, updatedAt: new Date() })
      .where(eq(trainees.id, trainee.id));
    // Keep the login/email record in sync so password resets reach the student.
    await db()
      .update(users)
      .set({ email: email || null })
      .where(eq(users.id, user.id ?? ""));
  } catch {
    return { ok: false, error: "Could not save your details. Try again." };
  }

  const changes: string[] = [];
  if ((trainee.email ?? "") !== email) changes.push("email");
  if ((trainee.phone ?? "") !== phone) changes.push("phone");
  if (changes.length > 0) {
    await recordAudit({
      actorId: user.id,
      actorName: user.name ?? null,
      actorRole: "student",
      action: "updated",
      entityType: "profile",
      entityId: trainee.id,
      summary: `${trainee.fullName} updated their ${changes.join(" and ")}`,
    });
  }

  revalidatePath("/profile");
  return { ok: true };
}
