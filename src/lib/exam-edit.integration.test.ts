/**
 * Ad-hoc end-to-end check for editing exam questions after the exam has been
 * opened/closed. Uses the real openExam/closeExam actions, then edits, adds,
 * deletes, and updates questions/details while the exam is open and closed,
 * asserting the real DB rows. Only the auth guard (requireStaff) is mocked.
 *
 * Not part of the default suite (integration config). Run with:
 *   npx vitest run --config vitest.integration.config.ts src/lib/exam-edit.integration.test.ts
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, courses, examQuestions, exams, notifications, users } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Stub the exam-available email — opening an exam must not send real mail.
vi.mock("@/lib/email", () => ({ sendExamAvailableEmail: vi.fn(async () => true) }));

// Fully mock the auth guard (next-auth fails to load under vitest). The mocked
// actor is a real master admin so FK constraints on audit rows hold.
vi.mock("@/lib/auth-guard", () => {
  const staff = async () => {
    const [admin] = await db()
      .select()
      .from(users)
      .where(eq(users.role, "master_admin"))
      .limit(1);
    return { id: admin.id, name: admin.name ?? null, role: admin.role };
  };
  return {
    requireUser: vi.fn(staff),
    requireStaff: vi.fn(staff),
    requireMasterAdmin: vi.fn(staff),
  };
});

const {
  createExam,
  addExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
  updateExamDetails,
  openExam,
  closeExam,
} = await import("@/lib/actions/exams");

const createdExams: { id: string; title: string }[] = [];

async function cleanup() {
  for (const exam of createdExams) {
    await db().delete(examQuestions).where(eq(examQuestions.examId, exam.id)).catch(() => {});
    await db().delete(auditLogs).where(eq(auditLogs.entityId, exam.id)).catch(() => {});
    // openExam notifies active students ("New exam available: <title>").
    await db()
      .delete(notifications)
      .where(eq(notifications.title, `New exam available: ${exam.title}`))
      .catch(() => {});
    await db().delete(exams).where(eq(exams.id, exam.id)).catch(() => {});
  }
  createdExams.length = 0;
}

async function activeCourseName(): Promise<string> {
  const [course] = await db()
    .select()
    .from(courses)
    .where(eq(courses.active, true))
    .limit(1);
  expect(course).toBeDefined();
  return course.name;
}

async function makeExam(title: string, topic: string): Promise<{ id: string; title: string }> {
  const fd = new FormData();
  fd.set("title", title);
  fd.set("topic", topic);
  fd.set("durationMinutes", "30");
  const created = await createExam(fd);
  expect(created.ok).toBe(true);
  createdExams.push({ id: created.id!, title });
  return { id: created.id!, title };
}

function objectiveForm(prompt: string, correct: string, points: string): FormData {
  const fd = new FormData();
  fd.set("type", "objective");
  fd.set("prompt", prompt);
  fd.set("option0", "Alpha");
  fd.set("option1", "Beta");
  fd.set("option2", "Gamma");
  fd.set("option3", "Delta");
  fd.set("correctOption", correct);
  fd.set("points", points);
  return fd;
}

function multipleForm(prompt: string, corrects: number[], points: string): FormData {
  const fd = new FormData();
  fd.set("type", "multiple");
  fd.set("prompt", prompt);
  fd.set("option0", "Red");
  fd.set("option1", "Green");
  fd.set("option2", "Blue");
  fd.set("option3", "Yellow");
  for (const index of corrects) fd.set(`correctOption${index}`, "on");
  fd.set("points", points);
  return fd;
}

describe("exam question editing after open/close (real DB)", () => {
  afterEach(cleanup);

  it("adds, edits, and deletes questions after the exam is opened and closed", async () => {
    const topic = await activeCourseName();
    const exam = await makeExam("Integration Exam Edit", topic);

    // Add an objective question while still a draft.
    const add1 = await addExamQuestion(exam.id, objectiveForm("What is 2+2?", "1", "2"));
    expect(add1.ok).toBe(true);
    const [question] = await db()
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, exam.id))
      .limit(1);
    expect(question).toBeDefined();

    // Real open.
    const opened = await openExam(exam.id, new Date(Date.now() + 24 * 3600_000).toISOString());
    expect(opened.ok).toBe(true);

    // Edit the question while open.
    const edit = await updateExamQuestion(
      exam.id,
      question.id,
      objectiveForm("What is 3+3?", "2", "3")
    );
    expect(edit.ok).toBe(true);
    const [afterEdit] = await db()
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.id, question.id))
      .limit(1);
    expect(afterEdit.prompt).toBe("What is 3+3?");
    expect(afterEdit.points).toBe(3);
    expect(afterEdit.correctOption).toBe(2);

    // Add a written question while open.
    const writtenFd = new FormData();
    writtenFd.set("type", "written");
    writtenFd.set("prompt", "Explain your working.");
    writtenFd.set("points", "5");
    const add2 = await addExamQuestion(exam.id, writtenFd);
    expect(add2.ok).toBe(true);

    // Real close.
    const closed = await closeExam(exam.id);
    expect(closed.ok).toBe(true);

    // Delete a question while closed (soft-delete).
    const del = await deleteExamQuestion(exam.id, question.id);
    expect(del.ok).toBe(true);
    const [deleted] = await db()
      .select({ deletedAt: examQuestions.deletedAt })
      .from(examQuestions)
      .where(eq(examQuestions.id, question.id))
      .limit(1);
    expect(deleted.deletedAt).not.toBeNull();

    // Update exam details while closed.
    const detailsFd = new FormData();
    detailsFd.set("title", "Integration Exam Edit Updated");
    detailsFd.set("durationMinutes", "45");
    detailsFd.set("description", "updated after close");
    const details = await updateExamDetails(exam.id, detailsFd);
    expect(details.ok).toBe(true);
    const [afterDetails] = await db()
      .select()
      .from(exams)
      .where(eq(exams.id, exam.id))
      .limit(1);
    expect(afterDetails.title).toBe("Integration Exam Edit Updated");
    expect(afterDetails.durationMinutes).toBe(45);
  });

  it("round-trips options and the answer key when editing a multi-answer question", async () => {
    const topic = await activeCourseName();
    const exam = await makeExam("Integration Exam Multi", topic);

    const add = await addExamQuestion(exam.id, multipleForm("Pick primaries", [0, 2], "4"));
    expect(add.ok).toBe(true);
    const [question] = await db()
      .select()
      .from(examQuestions)
      .where(and(eq(examQuestions.examId, exam.id), eq(examQuestions.type, "multiple")))
      .limit(1);
    expect(question).toBeDefined();
    expect((JSON.parse(question.correctOptions!) as number[]).sort()).toEqual([0, 2]);
    expect(JSON.parse(question.options!)).toEqual(["Red", "Green", "Blue", "Yellow"]);

    // Open, then edit the answer key + options.
    const opened = await openExam(exam.id, new Date(Date.now() + 24 * 3600_000).toISOString());
    expect(opened.ok).toBe(true);
    const edit = await updateExamQuestion(
      exam.id,
      question.id,
      multipleForm("Pick secondaries", [1, 3], "6")
    );
    expect(edit.ok).toBe(true);

    const [afterEdit] = await db()
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.id, question.id))
      .limit(1);
    expect(afterEdit.prompt).toBe("Pick secondaries");
    expect(afterEdit.points).toBe(6);
    expect(JSON.parse(afterEdit.correctOptions!)).toEqual([1, 3]);
  });

  it("rejects editing a question that does not belong to the exam", async () => {
    const topic = await activeCourseName();
    const examA = await makeExam("Integration Exam A", topic);
    const examB = await makeExam("Integration Exam B", topic);

    const add = await addExamQuestion(examA.id, objectiveForm("Belongs to A", "0", "1"));
    expect(add.ok).toBe(true);
    const [question] = await db()
      .select()
      .from(examQuestions)
      .where(eq(examQuestions.examId, examA.id))
      .limit(1);

    const edit = await updateExamQuestion(
      examB.id,
      question.id,
      objectiveForm("Trying to edit via B", "1", "2")
    );
    expect(edit.ok).toBe(false);
    expect(edit.error).toBe("Question not found.");
  });
});
