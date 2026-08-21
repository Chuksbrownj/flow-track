/**
 * End-to-end regression: re-opening a finished attempt must never re-submit
 * or toast "Time is up".
 *
 * The old bug: the exam player mounted for a stored (submitted) attempt and
 * its countdown immediately saw endsAt in the past, so it called submitExam
 * again and showed the "Time is up — your exam was submitted automatically."
 * toast on the result screen.
 *
 * This spec drives the real flow — take the exam, submit, go back to the
 * exams list, re-open the attempt — and asserts the result screen is shown
 * cleanly with no re-submit and no "Time is up" toast. It also verifies
 * Previous question navigation inside the exam.
 *
 * Run against the live deployment:
 *   npx playwright test --config=playwright.live.config.ts e2e/reopen-finished.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  courses,
  examQuestions,
  exams,
  examSubmissions,
  notifications,
  trainees,
  users,
} from "@/db/schema";

const STUDENT_REG = "E2E-REOPEN-001";
const STUDENT_PASSWORD = "e2e-pass-123";
const EXAM_TITLE = "E2E Reopen Finished Exam";
const Q1 = "E2E reopen question one";
const Q2 = "E2E reopen question two";

let studentUserId: string | null = null;
let traineeId: string | null = null;
let examId: string | null = null;

test.beforeAll(async () => {
  const database = db();

  // Remove leftovers from a previous interrupted run.
  const [oldExam] = await database.select().from(exams).where(eq(exams.title, EXAM_TITLE)).limit(1);
  if (oldExam) {
    await database.delete(examSubmissions).where(eq(examSubmissions.examId, oldExam.id));
    await database.delete(examQuestions).where(eq(examQuestions.examId, oldExam.id));
    await database.delete(notifications).where(eq(notifications.title, `New exam available: ${EXAM_TITLE}`));
    await database.delete(auditLogs).where(eq(auditLogs.entityId, oldExam.id));
    await database.delete(exams).where(eq(exams.id, oldExam.id));
  }
  const [oldTrainee] = await database
    .select()
    .from(trainees)
    .where(eq(trainees.registrationNumber, STUDENT_REG))
    .limit(1);
  if (oldTrainee) {
    const oldUserId = oldTrainee.userId;
    await database.delete(trainees).where(eq(trainees.id, oldTrainee.id));
    if (oldUserId) await database.delete(users).where(eq(users.id, oldUserId));
  }

  const [createdUser] = await database
    .insert(users)
    .values({
      name: "E2E Reopen Trainee",
      email: null,
      passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
      role: "student",
    })
    .returning({ id: users.id });
  studentUserId = createdUser.id;
  const [createdTrainee] = await database
    .insert(trainees)
    .values({
      userId: createdUser.id,
      registrationNumber: STUDENT_REG,
      fullName: "E2E Reopen Trainee",
      gender: "Male",
      phone: "0000000000",
      status: "active",
    })
    .returning({ id: trainees.id });
  traineeId = createdTrainee.id;

  // An open exam with two objective questions.
  const [course] = await database.select().from(courses).where(eq(courses.active, true)).limit(1);
  const [createdExam] = await database
    .insert(exams)
    .values({
      title: EXAM_TITLE,
      topic: course?.name ?? "Graphic Design",
      description: "Created by the reopen-finished spec.",
      durationMinutes: 30,
      status: "open",
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 24 * 3600_000),
    })
    .returning({ id: exams.id });
  examId = createdExam.id;
  await database.insert(examQuestions).values([
    {
      examId,
      type: "objective",
      prompt: `${Q1} — select Alpha.`,
      options: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
      correctOption: 0,
      points: 1,
      order: 0,
    },
    {
      examId,
      type: "objective",
      prompt: `${Q2} — select Alpha.`,
      options: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
      correctOption: 0,
      points: 1,
      order: 1,
    },
  ]);
});

test.beforeEach(async () => {
  // Every test starts with a fresh attempt (leftovers from a prior interrupted
  // run or an earlier test in this file are removed).
  if (examId && traineeId) {
    await db()
      .delete(examSubmissions)
      .where(and(eq(examSubmissions.examId, examId), eq(examSubmissions.traineeId, traineeId)))
      .catch(() => {});
  }
});

test.afterAll(async () => {
  const database = db();
  try {
    if (examId) {
      await database.delete(examSubmissions).where(eq(examSubmissions.examId, examId));
      await database.delete(examQuestions).where(eq(examQuestions.examId, examId));
      await database.delete(notifications).where(eq(notifications.title, `New exam available: ${EXAM_TITLE}`));
      await database.delete(auditLogs).where(eq(auditLogs.entityId, examId));
      await database.delete(exams).where(eq(exams.id, examId));
    }
    if (traineeId) await database.delete(trainees).where(eq(trainees.id, traineeId));
    if (studentUserId) await database.delete(users).where(eq(users.id, studentUserId));
  } catch (error) {
    console.warn("E2E reopen cleanup failed:", error);
  }
});

async function studentLogin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="identifier"]', STUDENT_REG);
  await page.fill('input[name="password"]', STUDENT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/portal|\/dashboard/);
}

async function openExamCard(page: Page, buttonName: string | RegExp) {
  await page.goto("/assessments");
  const card = page.locator('[data-slot="card"]').filter({ hasText: EXAM_TITLE }).first();
  await card.getByRole("button", { name: buttonName }).waitFor({ timeout: 30_000 });
  return card;
}

test("full flow: previous-question navigation, submit, and clean re-open of the finished attempt", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await studentLogin(page);
  const card = await openExamCard(page, "Start exam");
  await card.getByRole("button", { name: "Start exam" }).click();
  await expect(page.getByText(Q1)).toBeVisible({ timeout: 30_000 });

  // Answer Q1, move on, then come back — answer must be retained.
  await page.getByRole("button", { name: /Alpha/ }).first().click();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByText(Q2)).toBeVisible();
  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(page.getByText(Q1)).toBeVisible();
  const alphaClass = await page.getByRole("button", { name: /Alpha/ }).first().getAttribute("class");
  expect(alphaClass).toContain("ring-primary");
  // Back to Q2 for the finish.
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByText(Q2)).toBeVisible();

  await page.getByRole("button", { name: /Alpha/ }).first().click();
  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page.getByText(/Submitted Successfully/)).toBeVisible({ timeout: 45_000 });

  // Back to the exams list, then re-open the finished attempt.
  await page.getByRole("button", { name: "Back to exams" }).click();
  await page.waitForURL(/\/assessments/);
  const viewResult = page
    .locator('[data-slot="card"]')
    .filter({ hasText: EXAM_TITLE })
    .first()
    .getByRole("button", { name: /View result|View submission/ });
  await viewResult.waitFor({ timeout: 30_000 });
  await viewResult.click();

  // The result screen shows — and must NOT re-submit or toast "Time is up".
  await expect(page.getByText(/Submitted Successfully|Your final grade/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000); // window for any stray countdown/auto-submit
  await expect(page.getByText(/Time is up/)).not.toBeVisible();

  // Ground truth: still exactly one submission, and it's submitted (not re-submitted).
  const rows = examId
    ? await db()
        .select({ status: examSubmissions.status })
        .from(examSubmissions)
        .where(and(eq(examSubmissions.examId, examId), eq(examSubmissions.traineeId, traineeId!)))
    : [];
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("submitted");

  await context.close();
});

test("re-opening a finished attempt after time has run out never re-submits", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await studentLogin(page);
  const card = await openExamCard(page, "Start exam");
  await card.getByRole("button", { name: "Start exam" }).click();
  await expect(page.getByText(Q1)).toBeVisible({ timeout: 30_000 });

  // Take and submit the exam normally.
  await page.getByRole("button", { name: /Alpha/ }).first().click();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByText(Q2)).toBeVisible();
  await page.getByRole("button", { name: /Alpha/ }).first().click();
  await page.getByRole("button", { name: "Submit exam" }).click();
  await expect(page.getByText(/Submitted Successfully/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Back to exams" }).click();
  await page.waitForURL(/\/assessments/);

  // Simulate the trainee returning long after the exam clock expired: push the
  // attempt's start far enough back that endsAt (start + duration) is in the
  // past. The OLD bug: re-opening this attempt mounted the player, the
  // countdown saw endsAt in the past and immediately re-submitted + toasted
  // "Time is up".
  const [submission] = await db()
    .select({ id: examSubmissions.id })
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId!), eq(examSubmissions.traineeId, traineeId!)));
  expect(submission).toBeTruthy();
  await db()
    .update(examSubmissions)
    .set({ startedAt: new Date(Date.now() - 40 * 60_000) }) // 30-min exam, 40 min ago
    .where(eq(examSubmissions.id, submission.id));

  // Fresh page load so the re-open goes through the server session load.
  await page.reload();
  await page.waitForURL(/\/assessments/);
  const viewResult = page
    .locator('[data-slot="card"]')
    .filter({ hasText: EXAM_TITLE })
    .first()
    .getByRole("button", { name: /View result|View submission/ });
  await viewResult.waitFor({ timeout: 30_000 });
  await viewResult.click();

  // The result screen is shown — NOT a re-submit, NOT a "Time is up" toast.
  await expect(page.getByText(/Submitted Successfully|Your final grade/)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(6_000); // several countdown ticks past the expired endsAt
  await expect(page.getByText(/Time is up/)).not.toBeVisible();

  // Ground truth: still one submitted row — the re-open never re-submitted.
  const rows = await db()
    .select({ status: examSubmissions.status })
    .from(examSubmissions)
    .where(and(eq(examSubmissions.examId, examId!), eq(examSubmissions.traineeId, traineeId!)));
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("submitted");

  await context.close();
});
