/**
 * End-to-end coverage of the exam Escape-key anti-cheat against a real
 * Chromium session and the real database.
 *
 * The spec creates its own student, admin and open exam (cleaned up
 * afterwards), then drives the browser through every rule:
 *
 *   1. Three Escape presses auto-submit the exam.
 *   2. Leaving the exam screen for more than 10 seconds auto-submits it.
 *   3. Returning within 10 seconds cancels the clock — no submit.
 *   4. An admin can reopen an auto-submitted exam for the trainee.
 *
 * Headless Chromium quirk: it has no browser chrome, so the Escape key does
 * not natively exit fullscreen there (on a real desktop it does). The
 * fullscreen exit is therefore driven with the browser's own
 * `document.exitFullscreen()` — the same `fullscreenchange` the browser fires
 * after a real Escape. The Escape-key counting rule itself is exercised with
 * real keyboard input.
 *
 * Run with: npx playwright test
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

const STUDENT_REG = "E2E-ESCAPE-001";
const STUDENT_PASSWORD = "e2e-pass-123";
const EXAM_TITLE = "E2E Escape Exam";
const QUESTION_TEXT = "E2E escape question";

let adminId: string | null = null;
let adminEmail = "";
let adminPassword = "";
let studentUserId: string | null = null;
let traineeId: string | null = null;
let examId: string | null = null;

test.beforeAll(async () => {
  const database = db();

  // Remove leftovers from a previous interrupted run.
  const [oldExam] = await database
    .select()
    .from(exams)
    .where(eq(exams.title, EXAM_TITLE))
    .limit(1);
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

  // Admin from env (reuse an existing one so the seeded password works).
  adminEmail = (process.env.ADMIN_EMAIL ?? "admin@thrilled.com").toLowerCase().trim();
  adminPassword = process.env.ADMIN_PASSWORD ?? "admin1234";
  const [admin] = await database.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (admin) {
    adminId = admin.id;
  } else {
    const [created] = await database
      .insert(users)
      .values({
        name: "E2E Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "master_admin",
      })
      .returning({ id: users.id });
    adminId = created.id;
  }

  // Student (registration code + password, like a real signup).
  const [createdUser] = await database
    .insert(users)
    .values({
      name: "E2E Trainee",
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
      fullName: "E2E Trainee",
      gender: "Male",
      phone: "0000000000",
      status: "active",
    })
    .returning({ id: trainees.id });
  traineeId = createdTrainee.id;

  // An open exam with a single objective question.
  const [course] = await database.select().from(courses).where(eq(courses.active, true)).limit(1);
  const [createdExam] = await database
    .insert(exams)
    .values({
      title: EXAM_TITLE,
      topic: course?.name ?? "Graphic Design",
      description: "Created by the Playwright escape-flow spec.",
      durationMinutes: 30,
      status: "open",
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 3600_000),
      createdById: adminId,
    })
    .returning({ id: exams.id });
  examId = createdExam.id;
  await database.insert(examQuestions).values({
    examId,
    type: "objective",
    prompt: `${QUESTION_TEXT} — select Alpha.`,
    options: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
    correctOption: 0,
    points: 1,
    order: 0,
  });
});

test.beforeEach(async () => {
  // Every scenario starts with a fresh attempt.
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
    console.warn("E2E cleanup failed:", error);
  }
});

async function studentLogin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="identifier"]', STUDENT_REG);
  await page.fill('input[name="password"]', STUDENT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/portal|\/dashboard/);
}

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="identifier"]', adminEmail);
  await page.fill('input[name="password"]', adminPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

/** Starts (or resumes) the E2E exam from the student's assessments page. */
async function startExam(page: Page) {
  await page.goto("/assessments");
  const card = page.locator('[data-slot="card"]').filter({ hasText: EXAM_TITLE }).first();
  await card.getByRole("button", { name: /Start exam|Resume/ }).click();
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible({ timeout: 20_000 });
}

/**
 * The player requests fullscreen on mount; if headless rejected that (no user
 * gesture), a click is a user gesture and the player re-requests fullscreen.
 */
async function ensureFullscreen(page: Page) {
  await page
    .waitForFunction(() => Boolean(document.fullscreenElement), undefined, { timeout: 10_000 })
    .catch(() => {});
  if (!(await page.evaluate(() => Boolean(document.fullscreenElement)))) {
    await page.getByText(QUESTION_TEXT).click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement), undefined, { timeout: 10_000 });
  }
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
}

test("auto-submits after Escape is pressed more than twice", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await studentLogin(page);
  await startExam(page);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Two presses: still taking the exam.
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();

  await page.keyboard.press("Escape");
  // Third press auto-submits and explains why.
  await expect(page.getByText(/Escape was pressed 3 times/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Submitted Successfully/)).toBeVisible();

  await context.close();
});

test("auto-submits after the trainee stays away from the exam screen for more than 10 seconds", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await studentLogin(page);
  await startExam(page);
  await ensureFullscreen(page);

  // Leaving fullscreen is what Escape does on a real desktop.
  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await page.waitForFunction(() => !document.fullscreenElement);

  // Still taking the exam shortly after leaving…
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();

  // …but after the 10-second grace period it auto-submits.
  await expect(page.getByText(/more than 10 seconds/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/Submitted Successfully/)).toBeVisible();

  await context.close();
});

test("does not submit when the trainee returns within 10 seconds", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await studentLogin(page);
  await startExam(page);
  await ensureFullscreen(page);

  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await page.waitForFunction(() => !document.fullscreenElement);

  // Trainee clicks back into the exam well inside the 10-second window.
  await page.waitForTimeout(2_000);
  await page.getByText(QUESTION_TEXT).click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), undefined, { timeout: 10_000 });

  // More than 10 seconds after leaving: still taking the exam, no submit.
  await page.waitForTimeout(11_000);
  await expect(page.getByText(QUESTION_TEXT)).toBeVisible();
  await expect(page.getByText(/Submitted Successfully/)).not.toBeVisible();

  await context.close();
});

test("an admin can reopen an auto-submitted exam for a trainee while it is still open", async ({
  browser,
}) => {
  // Student: get auto-submitted by pressing Escape three times.
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await studentLogin(studentPage);
  await startExam(studentPage);
  await studentPage.keyboard.press("Escape");
  await studentPage.keyboard.press("Escape");
  await studentPage.keyboard.press("Escape");
  await expect(studentPage.getByText(/Escape was pressed 3 times/)).toBeVisible({ timeout: 20_000 });

  // Admin: reopen from the Trainees dialog.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminLogin(adminPage);
  await adminPage.goto("/assessments");
  const card = adminPage.locator('[data-slot="card"]').filter({ hasText: EXAM_TITLE }).first();
  await card.getByRole("button", { name: /Trainees/ }).click();
  await adminPage.getByRole("button", { name: "Reopen", exact: true }).first().click();
  await adminPage.getByRole("button", { name: "Reopen exam", exact: true }).click();
  await expect(adminPage.getByText(/Override granted/)).toBeVisible({ timeout: 20_000 });

  // Student: the exam is resumable where they left off.
  await studentPage.goto("/assessments");
  await expect(studentPage.getByRole("button", { name: /Resume/ })).toBeVisible({ timeout: 20_000 });
  await studentPage.getByRole("button", { name: /Resume/ }).click();
  await expect(studentPage.getByText(QUESTION_TEXT)).toBeVisible({ timeout: 20_000 });

  await studentContext.close();
  await adminContext.close();
});
