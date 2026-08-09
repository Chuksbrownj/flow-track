"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assessments, trainees } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { isUuid, validateScore } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; error?: string };

const scoreKeys = ["graphicDesign", "animation", "dataAnalysis", "hpLife"] as const;
export type ScoreKey = (typeof scoreKeys)[number];
export type AssessmentInput = Partial<Record<ScoreKey, number>>;

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves (upserts) one week's score row for a trainee. Scores are whole numbers
 * out of 100; Grand Total and Percentage are computed on the client.
 */
export async function saveAssessment(
  traineeId: string,
  week: string,
  scores: AssessmentInput
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(traineeId)) return { ok: false, error: "Trainee not found." };
  if (!WEEK_PATTERN.test(week)) return { ok: false, error: "Please choose a valid week." };

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
  if (Object.keys(values).length === 0) {
    return { ok: false, error: "Enter at least one score." };
  }

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName })
    .from(trainees)
    .where(eq(trainees.id, traineeId))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };

  try {
    const [existing] = await db()
      .select({ id: assessments.id })
      .from(assessments)
      .where(and(eq(assessments.traineeId, traineeId), eq(assessments.week, week)))
      .limit(1);

    if (existing) {
      await db()
        .update(assessments)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(assessments.id, existing.id));
    } else {
      await db().insert(assessments).values({ traineeId, week, ...values });
    }
  } catch {
    return { ok: false, error: "Could not save assessment. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "scores_saved",
    entityType: "score_sheet",
    entityId: traineeId,
    summary: `Saved week ${week} scores for ${trainee.fullName}`,
  });

  revalidatePath("/assessments");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
