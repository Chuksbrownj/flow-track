/**
 * First-pass LLM suggestion for written (theory) exam answers.
 *
 * The suggested grades are never final: they are stored on the submission and
 * shown to the trainer in the review queue, who approves or overrides each one.
 * Only the reviewed grade is shown to the trainee.
 *
 * Fully optional — if GEMINI_API_KEY is not set or the call fails, the trainer
 * grades manually (the app never depends on the LLM being available).
 */

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { examQuestions, examSubmissions } from "@/db/schema";

export type WrittenQuestionForLlm = {
  id: string;
  prompt: string;
  points: number;
};

const MAX_ATTEMPTS = 2;

/**
 * Suggests LLM grades for one submission's written answers and stores them on
 * the row. Runs in the background AFTER the trainee's submit response is sent
 * (via Next's `after()`), so the submit path never waits on the LLM.
 *
 * Best-effort: a missing key, a failed call, or a race with the trainer
 * grading manually leaves llmGrades null and the trainer grades by hand — the
 * app never depends on the LLM being available.
 */
export async function suggestWrittenGradesInBackground(
  submissionId: string,
  questions: WrittenQuestionForLlm[],
  answers: Record<string, string>
): Promise<void> {
  try {
    const raw = await suggestWrittenGrades(questions, answers);
    const llmGrades = sanitizeLlmGrades(raw, questions);
    if (!llmGrades) return;
    const [updated] = await db()
      .update(examSubmissions)
      .set({ llmGrades: JSON.stringify(llmGrades) })
      // Only fill suggestions while the submission still awaits grading — a
      // trainer who already saved grades must not be overwritten.
      .where(and(eq(examSubmissions.id, submissionId), eq(examSubmissions.status, "submitted")))
      .returning({ id: examSubmissions.id });
    if (updated) revalidatePath("/assessments");
  } catch (error) {
    console.error("Background LLM grading failed:", error);
  }
}

/**
 * Backfills LLM grade suggestions for submissions whose background grading was
 * skipped (the submit-time `after()` task was interrupted, or Gemini failed
 * transiently). Finds submitted, still-ungraded submissions that have no
 * suggestion yet and grades a bounded batch per run, so a single cron
 * invocation stays inside the serverless duration budget.
 *
 * Only touches submissions submitted more than 15 minutes ago, so one whose
 * background grading is still in flight is never graded twice.
 */
export async function sweepPendingLlmGrades(options?: {
  limit?: number;
  concurrency?: number;
}): Promise<{ processed: number }> {
  const limit = options?.limit ?? 15;
  const concurrency = options?.concurrency ?? 3;

  const pending = await db()
    .select({
      id: examSubmissions.id,
      examId: examSubmissions.examId,
      answers: examSubmissions.answers,
    })
    .from(examSubmissions)
    .where(
      and(
        eq(examSubmissions.status, "submitted"),
        isNull(examSubmissions.llmGrades),
        // Give the submit-time background task time to finish before we
        // duplicate its work.
        lt(examSubmissions.submittedAt, new Date(Date.now() - 15 * 60_000))
      )
    )
    .orderBy(asc(examSubmissions.submittedAt))
    .limit(limit);

  if (pending.length === 0) return { processed: 0 };

  const examIds = [...new Set(pending.map((submission) => submission.examId))];
  const questionRows = await db()
    .select({
      id: examQuestions.id,
      examId: examQuestions.examId,
      prompt: examQuestions.prompt,
      points: examQuestions.points,
    })
    .from(examQuestions)
    .where(
      and(
        inArray(examQuestions.examId, examIds),
        eq(examQuestions.type, "written"),
        isNull(examQuestions.deletedAt)
      )
    );
  const questionsByExam = new Map<string, WrittenQuestionForLlm[]>();
  for (const question of questionRows) {
    const list = questionsByExam.get(question.examId) ?? [];
    list.push({ id: question.id, prompt: question.prompt, points: question.points });
    questionsByExam.set(question.examId, list);
  }

  let processed = 0;
  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const graded = await Promise.all(
      batch.map(async (submission) => {
        const questions = questionsByExam.get(submission.examId) ?? [];
        if (questions.length === 0) return false; // objective-only — nothing to suggest
        const answers = submission.answers
          ? (JSON.parse(submission.answers) as Record<string, string>)
          : {};
        await suggestWrittenGradesInBackground(submission.id, questions, answers);
        return true;
      })
    );
    processed += graded.filter(Boolean).length;
  }
  return { processed };
}

/**
 * Asks Gemini to suggest a score (0..points) for each written answer.
 * Returns a {questionId: score} map, or null when the LLM is unavailable.
 */
export async function suggestWrittenGrades(
  questions: WrittenQuestionForLlm[],
  answers: Record<string, string>
): Promise<Record<string, number> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = questions
    .map((question) => {
      const answer = (answers[question.id] ?? "").trim() || "(no answer given)";
      return {
        questionId: question.id,
        prompt: question.prompt,
        maxPoints: question.points,
        answer,
      };
    })
    .map((entry) => JSON.stringify(entry))
    .join(",\n");

  const systemPrompt = [
    "You are a strict exam grader. Grade each written answer on how well it answers the question.",
    "Return ONLY a JSON object mapping each questionId to a whole-number score between 0 and its maxPoints.",
    "Be fair but rigorous: partial understanding earns partial credit; irrelevant or empty answers earn 0.",
    `Questions:\n[\n${payload}\n]`,
  ].join("\n");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("Gemini grading failed:", response.status, body.slice(0, 200));
        return null;
      }

      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = parseGradeJson(text);
      if (parsed && Object.keys(parsed).length > 0) return parsed;
    } catch (error) {
      console.error("Gemini grading request error:", error);
    }
  }

  return null;
}

/** Extracts a {questionId: number} map from whatever Gemini returns. */
export function parseGradeJson(text: string): Record<string, number> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      const num = Number(value);
      if (Number.isInteger(num) && num >= 0) result[key] = num;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Sanitizes LLM suggestions against the actual question list, so an LLM that
 * invents question ids or out-of-range scores can never corrupt grading.
 */
export function sanitizeLlmGrades(
  raw: Record<string, number> | null,
  questions: WrittenQuestionForLlm[]
): Record<string, number> | null {
  if (!raw) return null;
  const result: Record<string, number> = {};
  for (const question of questions) {
    const value = raw[question.id];
    if (typeof value === "number" && Number.isInteger(value)) {
      result[question.id] = Math.max(0, Math.min(value, question.points));
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
