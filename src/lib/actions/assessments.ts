"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assessmentScores, trainees } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { isUuid, validateScore } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; error?: string };

/** Scores keyed by course id. */
export type AssessmentInput = Record<string, number>;

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves one week's scores for a trainee, replacing any existing rows for that
 * (trainee, week). Scores are whole numbers out of 100; Grand Total and
 * Percentage are computed on the client.
 */
export async function saveAssessment(
  traineeId: string,
  week: string,
  scores: AssessmentInput
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(traineeId)) return { ok: false, error: "Trainee not found." };
  if (!WEEK_PATTERN.test(week)) return { ok: false, error: "Please choose a valid week." };

  const entries: { courseId: string; score: number }[] = [];
  for (const [courseId, value] of Object.entries(scores)) {
    if (!isUuid(courseId)) return { ok: false, error: "Invalid course." };
    if (!Number.isInteger(value)) return { ok: false, error: "Scores must be whole numbers." };
    const error = validateScore(value);
    if (error) return { ok: false, error };
    entries.push({ courseId, score: value });
  }
  if (entries.length === 0) return { ok: false, error: "Enter at least one score." };

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName })
    .from(trainees)
    .where(eq(trainees.id, traineeId))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };

  try {
    // Replace the whole (trainee, week) row set — course columns are dynamic.
    await db()
      .delete(assessmentScores)
      .where(and(eq(assessmentScores.traineeId, traineeId), eq(assessmentScores.week, week)));
    if (entries.length > 0) {
      await db()
        .insert(assessmentScores)
        .values(entries.map((entry) => ({ traineeId, week, ...entry })));
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
