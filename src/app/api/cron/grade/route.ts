import { NextResponse } from "next/server";
import { sweepPendingLlmGrades } from "@/lib/llm-grading";

/**
 * Backfill job for AI-suggested written grades — see `vercel.json` (crons).
 *
 * Grading normally runs in the background right after the trainee submits
 * (via `after()` in submitExam), but if that task is interrupted or Gemini
 * fails transiently the suggestion is never written. This sweep finds those
 * submissions and grades them, so the trainer's review dialog still gets its
 * suggestions. It is a safety net only — trainers can always grade manually.
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every cron
 * request; the endpoint refuses to run unless that header matches.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepPendingLlmGrades({ limit: 15, concurrency: 3 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Cron grading failed:", error);
    return NextResponse.json({ ok: false, error: "Grading sweep failed." }, { status: 500 });
  }
}
