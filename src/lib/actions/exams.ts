"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { examQuestions, exams, examSubmissions, trainees } from "@/db/schema";
import { requireStaff, requireUser } from "@/lib/auth-guard";
import { isValidTopic } from "@/lib/topics";
import { parseQuestionFile } from "@/lib/assessment-import";
import { isUuid } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export type ActionResult = { ok: boolean; error?: string; message?: string };

export type PlayerQuestion = {
  id: string;
  type: "objective" | "written";
  prompt: string;
  options: string[] | null;
  points: number;
};

export type ExamResult = {
  autoScore: number;
  totalPoints: number;
  writtenScore: number | null;
  percent: number | null;
  graded: boolean;
};

export type ExamSession = {
  examId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
  questions: PlayerQuestion[];
  answers: Record<string, string>;
  currentQuestion: number;
  fullscreenViolations: number;
  status: "in_progress" | "submitted" | "graded";
  result?: ExamResult;
};

function isExamOpen(
  exam: { status: string; opensAt: Date | null; closesAt: Date | null },
  now = new Date()
) {
  return (
    exam.status === "open" &&
    (!exam.opensAt || now >= exam.opensAt) &&
    (!exam.closesAt || now <= exam.closesAt)
  );
}

function percentOf(score: number | null, totalPoints: number): number | null {
  if (score === null || totalPoints <= 0) return null;
  return Math.round((score / totalPoints) * 100);
}

async function canManageExam(
  examId: string,
  staff: { id: string; role: string },
  requireDraft = false
) {
  const [exam] = await db().select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return { exam: null as null, error: "Exam not found." };
  if (staff.role === "admin" && exam.createdById !== staff.id) {
    return { exam: null as null, error: "You can only manage exams you created." };
  }
  if (requireDraft && exam.status !== "draft") {
    return { exam: null as null, error: "Only draft exams can be edited." };
  }
  return { exam, error: null as null };
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createExam(formData: FormData): Promise<ActionResult & { id?: string }> {
  const staff = await requireStaff();

  const title = value(formData, "title");
  const topic = value(formData, "topic");
  const durationRaw = value(formData, "durationMinutes");
  const description = value(formData, "description");

  if (title.length < 3) return { ok: false, error: "Title is required (at least 3 characters)." };
  if (!isValidTopic(topic)) return { ok: false, error: "Please choose a valid topic." };
  if (staff.role === "admin" && staff.topic && topic !== staff.topic) {
    return { ok: false, error: `You can only create exams for your topic (${staff.topic}).` };
  }
  const durationMinutes = Number(durationRaw);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    return { ok: false, error: "Duration must be a whole number of minutes between 1 and 240." };
  }

  try {
    const [created] = await db()
      .insert(exams)
      .values({
        title,
        topic,
        description: description || null,
        durationMinutes,
        status: "draft",
        createdById: staff.id,
      })
      .returning({ id: exams.id });
    await recordAudit({
      actorId: staff.id,
      actorName: staff.name ?? null,
      actorRole: staff.role,
      action: "exam_created",
      entityType: "exam",
      entityId: created.id,
      summary: `Created exam “${title}” (${topic})`,
    });
    revalidatePath("/assessments");
    return { ok: true, id: created.id };
  } catch {
    return { ok: false, error: "Could not create the exam. Try again." };
  }
}

export async function importQuestions(
  examId: string,
  formData: FormData
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };
  if (exam.status !== "draft") {
    return { ok: false, error: "Questions can only be added while the exam is a draft." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV or Excel file to upload." };
  }

  const result = await parseQuestionFile(file);
  if (!result.ok || !result.questions) {
    return {
      ok: false,
      error:
        result.errors && result.errors.length > 0
          ? result.errors.slice(0, 3).join(" ")
          : "Could not import the file.",
    };
  }

  const [maxRow] = await db()
    .select({ value: max(examQuestions.order) })
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId));
  const startOrder = (maxRow?.value ?? -1) + 1;

  try {
    await db()
      .insert(examQuestions)
      .values(
        result.questions.map((question, index) => ({
          examId,
          type: question.type,
          prompt: question.prompt,
          options: question.options ? JSON.stringify(question.options) : null,
          correctOption: question.correctOption,
          points: question.points,
          order: startOrder + index,
        }))
      );
  } catch {
    return { ok: false, error: "Could not save the questions. Try again." };
  }

  revalidatePath("/assessments");
  return { ok: true, message: `Imported ${result.imported} question${result.imported === 1 ? "" : "s"}.` };
}

export async function updateExamDetails(examId: string, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff, true);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  const title = value(formData, "title");
  const durationRaw = value(formData, "durationMinutes");
  const description = value(formData, "description");
  if (title.length < 3) return { ok: false, error: "Title is required (at least 3 characters)." };
  const durationMinutes = Number(durationRaw);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    return { ok: false, error: "Duration must be a whole number of minutes between 1 and 240." };
  }

  try {
    await db()
      .update(exams)
      .set({ title, description: description || null, durationMinutes, updatedAt: new Date() })
      .where(eq(exams.id, examId));
  } catch {
    return { ok: false, error: "Could not update the exam. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_updated",
    entityType: "exam",
    entityId: examId,
    summary: `Updated exam “${title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true };
}

export async function deleteExam(examId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff, true);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  try {
    await db().delete(exams).where(eq(exams.id, examId));
  } catch {
    return { ok: false, error: "Could not delete the exam. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_deleted",
    entityType: "exam",
    entityId: examId,
    summary: `Deleted exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true };
}

export async function openExam(examId: string, closesAt: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };
  if (exam.status !== "draft") {
    return { ok: false, error: "This exam is already open or closed." };
  }

  const close = new Date(closesAt);
  if (Number.isNaN(close.getTime())) return { ok: false, error: "Choose a closing date and time." };
  if (close.getTime() <= Date.now() + 60_000) {
    return { ok: false, error: "The closing time must be at least a minute from now." };
  }

  const [questionCount] = await db()
    .select({ value: max(examQuestions.order) })
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId));
  if ((questionCount?.value ?? -1) < 0) {
    return { ok: false, error: "Add at least one question before opening the exam." };
  }

  try {
    await db()
      .update(exams)
      .set({ status: "open", opensAt: new Date(), closesAt: close, updatedAt: new Date() })
      .where(eq(exams.id, examId));
  } catch {
    return { ok: false, error: "Could not open the exam. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_opened",
    entityType: "exam",
    entityId: examId,
    summary: `Opened exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true, message: "Exam opened. Trainees can now take it within the set window." };
}

export async function closeExam(examId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  try {
    await db()
      .update(exams)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(exams.id, examId));
  } catch {
    return { ok: false, error: "Could not close the exam. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_closed",
    entityType: "exam",
    entityId: examId,
    summary: `Closed exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true };
}

async function loadSession(exam: (typeof exams.$inferSelect), traineeId: string) {
  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, exam.id), eq(examSubmissions.traineeId, traineeId)))
    .limit(1);

  const questionRows = await db()
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, exam.id))
    .orderBy(asc(examQuestions.order));

  const questions: PlayerQuestion[] = questionRows.map((question) => ({
    id: question.id,
    type: question.type as "objective" | "written",
    prompt: question.prompt,
    options: question.options ? (JSON.parse(question.options) as string[]) : null,
    points: question.points,
  }));

  const base = {
    examId: exam.id,
    title: exam.title,
    description: exam.description,
    durationMinutes: exam.durationMinutes,
    questions,
  };

  if (!submission) return null;

  const answers = submission.answers ? (JSON.parse(submission.answers) as Record<string, string>) : {};
  const startedAt = submission.startedAt.getTime();
  const endsAt = startedAt + exam.durationMinutes * 60_000;

  const session: ExamSession = {
    ...base,
    startedAt: submission.startedAt.toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    answers,
    currentQuestion: submission.currentQuestion,
    fullscreenViolations: submission.fullscreenViolations,
    status: submission.status as ExamSession["status"],
  };

  if (submission.status === "submitted" || submission.status === "graded") {
    const totalPoints = submission.totalPoints;
    const autoScore = submission.autoScore ?? 0;
    const writtenScore = submission.writtenScore ?? null;
    const graded = submission.status === "graded";
    const hasObjective = questions.some((question) => question.type === "objective");
    session.result = {
      autoScore,
      totalPoints,
      writtenScore,
      // Written-only exams have no auto-grade until the trainer marks them.
      percent:
        graded || hasObjective
          ? percentOf((autoScore ?? 0) + (writtenScore ?? 0), totalPoints)
          : null,
      graded,
    };
  }

  return session;
}

export async function startExam(examId: string): Promise<ActionResult & { session?: ExamSession }> {
  const user = await requireUser();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  if (user.role !== "student") return { ok: false, error: "Only students can take exams." };

  const [exam] = await db().select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return { ok: false, error: "Exam not found." };
  if (!isExamOpen(exam)) return { ok: false, error: "This exam is not open right now." };

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };

  const existing = await loadSession(exam, trainee.id);

  if (!existing) {
    const questionRows = await db()
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, exam.id))
      .orderBy(asc(examQuestions.order));
    const totalPoints = questionRows.reduce((sum, question) => sum + question.points, 0);

    try {
      await db().insert(examSubmissions).values({
        examId: exam.id,
        traineeId: trainee.id,
        status: "in_progress",
        answers: "{}",
        totalPoints,
      });
    } catch {
      // A concurrent start already created the submission — resume it below.
    }

    const session = await loadSession(exam, trainee.id);
    revalidatePath("/assessments");
    return { ok: true, session: session ?? undefined };
  }

  // Submitted/graded exams are returned for result display (no re-taking).
  return { ok: true, session: existing };
}

export async function saveAnswer(
  examId: string,
  answers: Record<string, string>,
  currentQuestion: number
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  if (user.role !== "student") return { ok: false, error: "Only students can take exams." };

  const [exam] = await db().select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return { ok: false, error: "Exam not found." };
  if (!isExamOpen(exam)) return { ok: false, error: "This exam is no longer open." };

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };

  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId), eq(examSubmissions.traineeId, trainee.id)))
    .limit(1);
  if (!submission || submission.status !== "in_progress") {
    return { ok: false, error: "No active attempt found for this exam." };
  }

  const startedAt = submission.startedAt.getTime();
  if (Date.now() > startedAt + exam.durationMinutes * 60_000) {
    return { ok: false, error: "Time is up." };
  }

  const answersJson = JSON.stringify(answers);
  if (answersJson.length > 200_000) {
    return { ok: false, error: "Answer payload is too large." };
  }

  try {
    await db()
      .update(examSubmissions)
      .set({ answers: answersJson, currentQuestion })
      .where(eq(examSubmissions.id, submission.id));
  } catch {
    return { ok: false, error: "Could not save your answer. Try again." };
  }

  return { ok: true };
}

export async function recordViolation(examId: string): Promise<ActionResult & { violations?: number }> {
  const user = await requireUser();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  if (user.role !== "student") return { ok: false, error: "Only students can take exams." };

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };

  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId), eq(examSubmissions.traineeId, trainee.id)))
    .limit(1);
  if (!submission || submission.status !== "in_progress") {
    return { ok: false, error: "No active attempt found for this exam." };
  }

  let violations = submission.fullscreenViolations + 1;
  try {
    const [updated] = await db()
      .update(examSubmissions)
      .set({ fullscreenViolations: sql`${examSubmissions.fullscreenViolations} + 1` })
      .where(eq(examSubmissions.id, submission.id))
      .returning({ fullscreenViolations: examSubmissions.fullscreenViolations });
    violations = updated?.fullscreenViolations ?? violations;
  } catch {
    return { ok: false, error: "Could not record the violation. Try again." };
  }

  return { ok: true, violations };
}

export async function submitExam(examId: string): Promise<ActionResult & { result?: ExamResult }> {
  const user = await requireUser();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  if (user.role !== "student") return { ok: false, error: "Only students can take exams." };

  const [exam] = await db().select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return { ok: false, error: "Exam not found." };

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };

  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId), eq(examSubmissions.traineeId, trainee.id)))
    .limit(1);
  if (!submission) return { ok: false, error: "No attempt found for this exam." };

  if (submission.status === "submitted" || submission.status === "graded") {
    const writtenScore = submission.writtenScore ?? null;
    const autoScore = submission.autoScore ?? 0;
    const graded = submission.status === "graded";
    return {
      ok: true,
      result: {
        autoScore,
        totalPoints: submission.totalPoints,
        writtenScore,
        percent: percentOf(autoScore + (writtenScore ?? 0), submission.totalPoints),
        graded,
      },
    };
  }

  const questionRows = await db()
    .select()
    .from(examQuestions)
    .where(eq(examQuestions.examId, examId))
    .orderBy(asc(examQuestions.order));
  const answers = submission.answers ? (JSON.parse(submission.answers) as Record<string, string>) : {};

  let autoScore = 0;
  for (const question of questionRows) {
    if (question.type !== "objective" || question.correctOption === null) continue;
    if (String(answers[question.id]) === String(question.correctOption)) {
      autoScore += question.points;
    }
  }

  // Written-only exams have nothing to auto-grade yet; don't show/write 0%.
  const hasObjective = questionRows.some((question) => question.type === "objective");
  const percent = hasObjective ? percentOf(autoScore, submission.totalPoints) : null;

  try {
    await db()
      .update(examSubmissions)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        answers: JSON.stringify(answers),
        autoScore,
      })
      .where(eq(examSubmissions.id, submission.id));

  } catch {
    return { ok: false, error: "Could not submit the exam. Try again." };
  }

  revalidatePath("/assessments");
  revalidatePath("/portal");
  return {
    ok: true,
    result: { autoScore, totalPoints: submission.totalPoints, writtenScore: null, percent, graded: false },
  };
}

export async function gradeWritten(
  submissionId: string,
  grades: Record<string, number>
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(submissionId)) return { ok: false, error: "Submission not found." };

  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(eq(examSubmissions.id, submissionId))
    .limit(1);
  if (!submission) return { ok: false, error: "Submission not found." };
  if (submission.status !== "submitted") {
    return { ok: false, error: "Only submitted exams can be graded." };
  }

  const [exam] = await db().select().from(exams).where(eq(exams.id, submission.examId)).limit(1);
  if (!exam) return { ok: false, error: "Exam not found." };
  if (staff.role === "admin" && exam.createdById !== staff.id) {
    return { ok: false, error: "You can only grade exams you created." };
  }

  const writtenQuestions = await db()
    .select()
    .from(examQuestions)
    .where(and(eq(examQuestions.examId, exam.id), eq(examQuestions.type, "written")));

  let writtenScore = 0;
  const graded: Record<string, number> = {};
  for (const question of writtenQuestions) {
    const value = grades[question.id];
    if (value === undefined || value === null) {
      return { ok: false, error: "Please grade every written question." };
    }
    if (!Number.isInteger(value) || value < 0 || value > question.points) {
      return { ok: false, error: `A written question grade must be between 0 and ${question.points}.` };
    }
    graded[question.id] = value;
    writtenScore += value;
  }

  try {
    await db()
      .update(examSubmissions)
      .set({
        status: "graded",
        writtenScore,
        writtenGrades: JSON.stringify(graded),
        gradedById: staff.id,
        gradedAt: new Date(),
      })
      .where(eq(examSubmissions.id, submissionId));

  } catch {
    return { ok: false, error: "Could not save the grades. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_graded",
    entityType: "exam",
    entityId: exam.id,
    summary: `Graded written answers for exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  revalidatePath("/portal");
  return { ok: true };
}

export async function overrideSubmission(submissionId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(submissionId)) return { ok: false, error: "Submission not found." };

  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(eq(examSubmissions.id, submissionId))
    .limit(1);
  if (!submission) return { ok: false, error: "Submission not found." };

  const [exam] = await db().select().from(exams).where(eq(exams.id, submission.examId)).limit(1);
  if (!exam) return { ok: false, error: "Exam not found." };
  if (!isExamOpen(exam)) {
    return { ok: false, error: "You can only override while the exam window is still open." };
  }
  if (staff.role === "admin" && exam.createdById !== staff.id) {
    return { ok: false, error: "You can only override exams you created." };
  }

  try {
    await db()
      .update(examSubmissions)
      .set({
        status: "in_progress",
        startedAt: new Date(), // reset the countdown so resuming actually works
        submittedAt: null,
        fullscreenViolations: 0,
        overriddenAt: new Date(),
        overriddenById: staff.id,
      })
      .where(eq(examSubmissions.id, submissionId));
  } catch {
    return { ok: false, error: "Could not override the submission. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_override",
    entityType: "exam",
    entityId: exam.id,
    summary: `Granted an override for exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true, message: "Override granted. The trainee can resume where they left off." };
}
