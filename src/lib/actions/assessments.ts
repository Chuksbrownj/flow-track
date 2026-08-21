"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { assessmentScores, trainees } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { isUuid, validateScore } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { type ActionResult } from "@/lib/actions/utils";

/** Weekly scores keyed by week (YYYY-MM-DD). A null value clears that week. */
export type CourseScoreInput = Record<string, number | null>;

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves one trainee's scores for a single course across any number of weeks,
 * replacing the existing rows for the (trainee, course) weeks provided. null
 * values clear that week's score. Scores are whole numbers out of 100; course
 * totals and the grand total are computed on the client.
 */
export async function saveCourseScores(
  traineeId: string,
  courseId: string,
  scores: CourseScoreInput
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(traineeId)) return { ok: false, error: "Trainee not found." };
  if (!isUuid(courseId)) return { ok: false, error: "Invalid course." };

  const weeks = Object.keys(scores);
  const upserts: { week: string; score: number }[] = [];
  for (const [week, value] of Object.entries(scores)) {
    if (!WEEK_PATTERN.test(week)) return { ok: false, error: "Please choose a valid week." };
    if (value === null) continue;
    if (!Number.isInteger(value)) return { ok: false, error: "Scores must be whole numbers." };
    const error = validateScore(value);
    if (error) return { ok: false, error };
    upserts.push({ week, score: value });
  }

  const [trainee] = await db()
    .select({ id: trainees.id, fullName: trainees.fullName })
    .from(trainees)
    .where(eq(trainees.id, traineeId))
    .limit(1);
  if (!trainee) return { ok: false, error: "Trainee not found." };

  try {
    // Replace the (trainee, course) weeks provided — cleared weeks are deleted.
    if (weeks.length > 0) {
      await db()
        .delete(assessmentScores)
        .where(
          and(
            eq(assessmentScores.traineeId, traineeId),
            eq(assessmentScores.courseId, courseId),
            inArray(assessmentScores.week, weeks)
          )
        );
    }
    if (upserts.length > 0) {
      await db()
        .insert(assessmentScores)
        .values(upserts.map((entry) => ({ traineeId, courseId, ...entry })));
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
    summary: `Saved scores for ${trainee.fullName}`,
  });

  revalidatePath("/assessments");
  revalidatePath("/dashboard");
  revalidatePath("/portal");
  return { ok: true };
}
