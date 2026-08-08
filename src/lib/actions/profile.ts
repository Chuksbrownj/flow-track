"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";

export type ContactDetails = { email: string | null; phone: string | null };

export async function getContactDetails(): Promise<ContactDetails> {
  const user = await requireUser();
  if (user.role === "admin") return { email: null, phone: null };

  const [trainee] = await db()
    .select({ email: trainees.email, phone: trainees.phone })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);

  return { email: trainee?.email ?? null, phone: trainee?.phone ?? null };
}
