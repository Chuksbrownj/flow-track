"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assessments, trainees } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { validateScore } from "@/lib/validation";

export type ActionResult = { ok: boolean; error?: string };

const scoreKeys = ["graphicDesign", "animation", "dataAnalysis", "hpLife"] as const;
export type ScoreKey = (typeof scoreKeys)[number];
export type AssessmentInput = Partial<Record<ScoreKey, number>>;

export async function saveAssessment(
  traineeId: string,
  scores: AssessmentInput
): Promise<ActionResult> {
  await requireUser();

  const values: Partial<Record<ScoreKey, number>> = {};
  for (const key of scoreKeys) {
    const value = scores[key];
    if (value === undefined || value === null) continue;
    if (!Number.isInteger(value)) {
      return { ok: false, error: "Scores must be whole numbers." };
    }
    const error = validateScore(value);
    if (error) return { ok: false, error };
    values[key] = value;
  }

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.id, traineeId))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };

  try {
    const [existing] = await db()
      .select({ id: assessments.id })
      .from(assessments)
      .where(eq(assessments.traineeId, traineeId))
      .limit(1);

    if (existing) {
      await db()
        .update(assessments)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(assessments.id, existing.id));
    } else {
      await db().insert(assessments).values({ traineeId, ...values });
    }
  } catch {
    return { ok: false, error: "Could not save assessment. Try again." };
  }

  revalidatePath("/assessments");
  revalidatePath("/dashboard");
  return { ok: true };
}
