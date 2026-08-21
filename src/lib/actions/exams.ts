"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { examQuestions, exams, examSubmissions, notifications, trainees, users } from "@/db/schema";
import { requireStaff, requireUser } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { isValidCourse } from "@/lib/courses";
import {
  parseQuestionFile,
  validateImportedQuestions,
  type ImportedQuestion,
} from "@/lib/assessment-import";
import { isUuid } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { suggestWrittenGradesInBackground } from "@/lib/llm-grading";
import { sendExamAvailableEmail } from "@/lib/email";

export type ActionResult = { ok: boolean; error?: string; message?: string };

export type PlayerQuestion = {
  id: string;
  type: "objective" | "multiple" | "written";
  prompt: string;
  options: string[] | null;
  points: number;
};

export type ExamResult = {
  autoScore: number;
  totalPoints: number;
  writtenScore: number | null;
  percent: number | null;
  /** True when the full submission has been graded (auto + reviewed written). */
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

// Per-user abuse limits for the exam-taking actions. Generous for legitimate
// use (the player's autosave is debounced; a trainee submits once) but they
// stop scripted hammering — each submit would otherwise re-run background
// LLM grading and write a DB row per save.
const EXAM_SAVE_LIMIT = 60; // autosaves per minute
const EXAM_SAVE_WINDOW_MS = 60_000;
const EXAM_VIOLATION_LIMIT = 30; // window-switch records per minute
const EXAM_VIOLATION_WINDOW_MS = 60_000;
const EXAM_SUBMIT_LIMIT = 5; // submits per minute (client already blocks double-clicks)
const EXAM_SUBMIT_WINDOW_MS = 60_000;

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
  staff: { id: string; role: string }
) {
  const [exam] = await db()
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
    .limit(1);
  if (!exam) return { exam: null as null, error: "Exam not found." };
  if (staff.role === "admin" && exam.createdById !== staff.id) {
    return { exam: null as null, error: "You can only manage exams you created." };
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
  if (!(await isValidCourse(topic))) return { ok: false, error: "Please choose a valid course." };
  if (staff.role === "admin" && staff.topic && topic !== staff.topic) {
    return { ok: false, error: `You can only create exams for your course (${staff.topic}).` };
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

/**
 * Parses an uploaded question file (CSV/Excel/PDF/Word/Markdown) and returns
 * the questions for admin review — nothing is saved yet.
 */
export async function previewQuestionFile(
  formData: FormData
): Promise<ActionResult & { questions?: ImportedQuestion[] }> {
  await requireStaff();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV, Excel, PDF, Word, Markdown or HTML file to upload." };
  }

  const result = await parseQuestionFile(file);
  if (!result.ok || !result.questions) {
    return {
      ok: false,
      error:
        result.errors && result.errors.length > 0
          ? result.errors.slice(0, 3).join(" ")
          : "Could not read the file.",
    };
  }

  return { ok: true, questions: result.questions };
}

/**
 * Saves reviewed questions into an exam. The questions were parsed and shown
 * in the preview step, but the server re-validates them before inserting.
 */
export async function importQuestions(
  examId: string,
  questions: ImportedQuestion[]
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  const validated = validateImportedQuestions(questions);
  if (!validated.ok) return { ok: false, error: validated.error };
  const parsed = validated.questions;

  const [maxRow] = await db()
    .select({ value: max(examQuestions.order) })
    .from(examQuestions)
    .where(and(eq(examQuestions.examId, examId), isNull(examQuestions.deletedAt)));
  const startOrder = (maxRow?.value ?? -1) + 1;

  try {
    await db()
      .insert(examQuestions)
      .values(
        parsed.map((question, index) => ({
          examId,
          type: question.type,
          prompt: question.prompt,
          options: question.options ? JSON.stringify(question.options) : null,
          correctOption: question.correctOption,
          correctOptions: question.correctOptions
            ? JSON.stringify(question.correctOptions)
            : null,
          points: question.points,
          order: startOrder + index,
        }))
      );
  } catch {
    return { ok: false, error: "Could not save the questions. Try again." };
  }

  revalidatePath("/assessments");
  return { ok: true, message: `Imported ${parsed.length} question${parsed.length === 1 ? "" : "s"}.` };
}

export type QuestionInput = {
  type: "objective" | "multiple" | "written";
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  correctOptions: number[] | null;
  points: number;
};

function parseQuestionForm(
  formData: FormData
): { ok: true; input: QuestionInput } | { ok: false; error: string } {
  const type = value(formData, "type") as "objective" | "multiple" | "written";
  const prompt = value(formData, "prompt");
  const pointsRaw = value(formData, "points");

  if (type !== "objective" && type !== "multiple" && type !== "written") {
    return { ok: false, error: "Please choose a question type." };
  }
  if (prompt.length < 3) {
    return { ok: false, error: "Question text is required (at least 3 characters)." };
  }

  const points = Number(pointsRaw);
  if (!Number.isInteger(points) || points < 1 || points > 100) {
    return { ok: false, error: "Points must be a whole number between 1 and 100." };
  }

  let options: string[] | null = null;
  let correctOption: number | null = null;
  let correctOptions: number[] | null = null;
  if (type === "objective" || type === "multiple") {
    const rawOptions = [0, 1, 2, 3].map((index) => value(formData, `option${index}`));
    if (rawOptions.some((option) => !option)) {
      return { ok: false, error: "Every option (A–D) is required for objective questions." };
    }
    options = rawOptions;
    if (type === "objective") {
      correctOption = Number(value(formData, "correctOption"));
      if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3) {
        return { ok: false, error: "Please choose the correct option." };
      }
    } else {
      correctOptions = [0, 1, 2, 3].filter(
        (index) => value(formData, `correctOption${index}`) === "on"
      );
      if (correctOptions.length < 1) {
        return { ok: false, error: "Please choose at least one correct option." };
      }
    }
  }

  return { ok: true, input: { type, prompt, options, correctOption, correctOptions, points } };
}

/** Adds one question to an exam (form-based question builder). */
export async function addExamQuestion(
  examId: string,
  formData: FormData
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.input;

  const [maxRow] = await db()
    .select({ value: max(examQuestions.order) })
    .from(examQuestions)
    .where(and(eq(examQuestions.examId, examId), isNull(examQuestions.deletedAt)));
  const order = (maxRow?.value ?? -1) + 1;

  try {
    await db().insert(examQuestions).values({
      examId,
      type: input.type,
      prompt: input.prompt,
      options: input.options ? JSON.stringify(input.options) : null,
      correctOption: input.correctOption,
      correctOptions: input.correctOptions ? JSON.stringify(input.correctOptions) : null,
      points: input.points,
      order,
    });
  } catch {
    return { ok: false, error: "Could not save the question. Try again." };
  }

  revalidatePath("/assessments");
  return { ok: true, message: "Question added." };
}

/** Updates an existing question's text, options, answer key, and points. */
export async function updateExamQuestion(
  examId: string,
  questionId: string,
  formData: FormData
): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId) || !isUuid(questionId)) return { ok: false, error: "Question not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  const [question] = await db()
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(and(eq(examQuestions.id, questionId), eq(examQuestions.examId, examId)))
    .limit(1);
  if (!question) return { ok: false, error: "Question not found." };

  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.input;

  try {
    await db()
      .update(examQuestions)
      .set({
        type: input.type,
        prompt: input.prompt,
        options: input.options ? JSON.stringify(input.options) : null,
        correctOption: input.correctOption,
        correctOptions: input.correctOptions ? JSON.stringify(input.correctOptions) : null,
        points: input.points,
      })
      .where(eq(examQuestions.id, questionId));
  } catch {
    return { ok: false, error: "Could not update the question. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_updated",
    entityType: "exam",
    entityId: examId,
    summary: `Updated a question in exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true, message: "Question updated." };
}

export async function updateExamDetails(examId: string, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
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

/** Soft-deletes a question. Grades already recorded stay intact. */
export async function deleteExamQuestion(examId: string, questionId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId) || !isUuid(questionId)) return { ok: false, error: "Question not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  const [question] = await db()
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(and(eq(examQuestions.id, questionId), eq(examQuestions.examId, examId)))
    .limit(1);
  if (!question) return { ok: false, error: "Question not found." };

  try {
    await db()
      .update(examQuestions)
      .set({ deletedAt: new Date() })
      .where(eq(examQuestions.id, questionId));
  } catch {
    return { ok: false, error: "Could not delete the question. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_updated",
    entityType: "exam",
    entityId: examId,
    summary: `Removed a question from exam “${exam.title}”`,
  });

  revalidatePath("/assessments");
  return { ok: true, message: "Question deleted." };
}

/**
 * Soft-deletes an exam. Works for any status (draft, open, closed) and never
 * removes submissions or grades — they stay intact for reporting.
 */
export async function deleteExam(examId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };

  try {
    await db()
      .update(exams)
      .set({ deletedAt: new Date(), status: "closed", updatedAt: new Date() })
      .where(eq(exams.id, examId));
    await db()
      .update(examQuestions)
      .set({ deletedAt: new Date() })
      .where(eq(examQuestions.examId, examId));
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
    summary: `Deleted exam “${exam.title}” (grades kept)`,
  });

  revalidatePath("/assessments");
  return { ok: true };
}

/** Notifies every student with an active trainee profile about a newly opened exam. */
async function notifyTraineesAboutExam(exam: { id: string; title: string; topic: string }) {
  try {
    const studentRows = await db()
      .select({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(trainees, eq(trainees.userId, users.id))
      .where(and(eq(users.role, "student"), eq(trainees.status, "active")));

    if (studentRows.length === 0) return;

    const title = `New exam available: ${exam.title}`;
    const body = `A new ${exam.topic} exam has been opened. You can take it now.`;
    const link = "/assessments";

    await db().insert(notifications).values(
      studentRows.map((student) => ({ userId: student.id, title, body, link }))
    );

    // Best-effort emails — a missing Brevo key must not fail opening the exam.
    await Promise.allSettled(
      studentRows
        .filter((student) => student.email)
        .map((student) => sendExamAvailableEmail(student.email!, exam.title, exam.topic))
    );
  } catch (error) {
    console.error("notifyTraineesAboutExam failed", error);
  }
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
    .where(and(eq(examQuestions.examId, examId), isNull(examQuestions.deletedAt)));
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

  await notifyTraineesAboutExam({ id: examId, title: exam.title, topic: exam.topic });

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
  return { ok: true, message: "Exam closed." };
}

/**
 * Reopens a closed exam so trainees can continue or retake it. The window is
 * restarted from now (24h if the original close time already passed).
 */
export async function reopenExam(examId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  const { exam, error } = await canManageExam(examId, staff);
  if (!exam) return { ok: false, error: error ?? "Cannot manage this exam." };
  if (exam.status !== "closed") {
    return { ok: false, error: "Only closed exams can be reopened." };
  }

  const now = new Date();
  const originalClose = exam.closesAt?.getTime() ?? 0;
  const closesAt = originalClose > now.getTime() ? exam.closesAt : new Date(now.getTime() + 24 * 3600_000);

  try {
    await db()
      .update(exams)
      .set({ status: "open", opensAt: now, closesAt, updatedAt: now })
      .where(eq(exams.id, examId));
  } catch {
    return { ok: false, error: "Could not reopen the exam. Try again." };
  }

  await recordAudit({
    actorId: staff.id,
    actorName: staff.name ?? null,
    actorRole: staff.role,
    action: "exam_reopened",
    entityType: "exam",
    entityId: examId,
    summary: `Reopened exam “${exam.title}”`,
  });

  await notifyTraineesAboutExam({ id: examId, title: exam.title, topic: exam.topic });

  revalidatePath("/assessments");
  return { ok: true, message: "Exam reopened. Trainees can continue or retake it." };
}

async function loadQuestions(examId: string) {
  return db()
    .select()
    .from(examQuestions)
    .where(and(eq(examQuestions.examId, examId), isNull(examQuestions.deletedAt)))
    .orderBy(asc(examQuestions.order));
}

async function loadSession(exam: (typeof exams.$inferSelect), traineeId: string) {
  const [submission] = await db()
    .select()
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, exam.id), eq(examSubmissions.traineeId, traineeId)))
    .limit(1);

  const questionRows = await loadQuestions(exam.id);

  const questions: PlayerQuestion[] = questionRows.map((question) => ({
    id: question.id,
    type: question.type as PlayerQuestion["type"],
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
    const graded =
      submission.status === "graded" ||
      (submission.status === "submitted" && !questions.some((question) => question.type === "written"));
    const hasAutoGradable = questions.some(
      (question) => question.type === "objective" || question.type === "multiple"
    );
    session.result = {
      autoScore,
      totalPoints,
      writtenScore,
      // Written-only exams have no auto-grade until the trainer marks them.
      percent:
        graded || hasAutoGradable
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

  const [exam] = await db()
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
    .limit(1);
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
    const questionRows = await loadQuestions(exam.id);
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

  // The player autosaves on every answer/navigation (debounced), so legitimate
  // use is well under this; it only trips scripted abuse.
  const limited = await rateLimit(`exam:save:${user.id}`, EXAM_SAVE_LIMIT, EXAM_SAVE_WINDOW_MS);
  if (!limited.ok) return { ok: false, error: "Too many saves. Try again shortly." };

  const [exam] = await db()
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
    .limit(1);
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

  const limited = await rateLimit(`exam:violation:${user.id}`, EXAM_VIOLATION_LIMIT, EXAM_VIOLATION_WINDOW_MS);
  if (!limited.ok) return { ok: false, error: "Too many window switches. Slow down." };

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

/** Auto-grades one question's answer. Returns earned points. */
function autoGradeQuestion(
  question: { type: string; correctOption: number | null; correctOptions: string | null; points: number },
  answer: string | undefined
): number {
  if (answer === undefined) return 0;
  if (question.type === "objective") {
    return String(answer) === String(question.correctOption) ? question.points : 0;
  }
  if (question.type === "multiple") {
    let correct: number[];
    try {
      correct = question.correctOptions ? (JSON.parse(question.correctOptions) as number[]) : [];
    } catch {
      return 0;
    }
    if (correct.length === 0) return 0;
    let selected: number[];
    try {
      selected = JSON.parse(answer) as number[];
    } catch {
      return 0;
    }
    const same =
      Array.isArray(selected) &&
      selected.length === correct.length &&
      [...selected].sort().every((value, index) => value === [...correct].sort()[index]);
    return same ? question.points : 0;
  }
  return 0;
}

export async function submitExam(examId: string): Promise<ActionResult & { result?: ExamResult }> {
  const user = await requireUser();
  if (!isUuid(examId)) return { ok: false, error: "Exam not found." };
  if (user.role !== "student") return { ok: false, error: "Only students can take exams." };

  // A trainee submits once; this only catches a runaway client or scripted
  // abuse hammering submit (each call would otherwise re-run LLM grading).
  const limited = await rateLimit(`exam:submit:${user.id}`, EXAM_SUBMIT_LIMIT, EXAM_SUBMIT_WINDOW_MS);
  if (!limited.ok) return { ok: false, error: "You already submitted. Refresh to see your result." };

  const [exam] = await db()
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), isNull(exams.deletedAt)))
    .limit(1);
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

  const questionRows = await loadQuestions(examId);

  if (submission.status === "submitted" || submission.status === "graded") {
    const writtenScore = submission.writtenScore ?? null;
    const autoScore = submission.autoScore ?? 0;
    const hasWritten = questionRows.some((question) => question.type === "written");
    const graded = submission.status === "graded" || (submission.status === "submitted" && !hasWritten);
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

  const answers = submission.answers ? (JSON.parse(submission.answers) as Record<string, string>) : {};

  let autoScore = 0;
  for (const question of questionRows) {
    autoScore += autoGradeQuestion(question, answers[question.id]);
  }

  // Written-only exams have nothing to auto-grade yet; don't show/write 0%.
  const hasAutoGradable = questionRows.some(
    (question) => question.type === "objective" || question.type === "multiple"
  );
  const percent = hasAutoGradable ? percentOf(autoScore, submission.totalPoints) : null;

  // FEAT-06: first-pass LLM suggestion for written questions. Grading runs in
  // the background AFTER this response is sent (via `after()`), so the submit
  // path never waits on the LLM — under load, submissions stay instant and the
  // suggestions appear in the trainer's review dialog moments later. Best
  // effort: if the LLM is unavailable the trainer grades manually.
  const writtenQuestions = questionRows.filter((question) => question.type === "written");

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

  if (writtenQuestions.length > 0) {
    const submissionId = submission.id;
    const answerSnapshot = { ...answers };
    after(() =>
      suggestWrittenGradesInBackground(submissionId, writtenQuestions, answerSnapshot)
    );
  }

  revalidatePath("/assessments");
  revalidatePath("/portal");
  return {
    ok: true,
    result: {
      autoScore,
      totalPoints: submission.totalPoints,
      writtenScore: null,
      percent,
      graded: false,
    },
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
    .where(
      and(
        eq(examQuestions.examId, exam.id),
        eq(examQuestions.type, "written"),
        isNull(examQuestions.deletedAt)
      )
    );

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
  return { ok: true, message: "Grades saved successfully." };
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
