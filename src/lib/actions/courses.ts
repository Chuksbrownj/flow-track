"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { courses, users } from "@/db/schema";
import { requireMasterAdmin, requireUser } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isValidCourse } from "@/lib/courses";

import { value, type ActionResult } from "@/lib/actions/utils";

/** Master admin: add a new course to the programme (score sheet + exams). */
export async function addCourse(formData: FormData): Promise<ActionResult> {
  const admin = await requireMasterAdmin();

  const name = value(formData, "name");
  if (name.length < 3 || name.length > 60) {
    return { ok: false, error: "Course name must be 3–60 characters." };
  }

  const [existing] = await db().select({ id: courses.id }).from(courses).where(eq(courses.name, name)).limit(1);
  if (existing) return { ok: false, error: "A course with this name already exists." };

  try {
    await db().insert(courses).values({ name, active: true });
  } catch {
    return { ok: false, error: "Could not add the course. Try again." };
  }

  await recordAudit({
    actorId: admin.id,
    actorName: admin.name ?? null,
    actorRole: "master_admin",
    action: "course_added",
    entityType: "course",
    summary: `Added course “${name}”`,
  });

  revalidatePath("/settings");
  revalidatePath("/assessments");
  revalidatePath("/staff");
  return { ok: true, message: `Course “${name}” added. It now appears in the score sheet and exams.` };
}

/**
 * Self-service course selection for staff. Admins (and master admins acting as
 * trainers) pick their own course on first login. The field is locked after the
 * first selection — only a master admin can change it (via the Staff page).
 */
export async function selectMyCourse(courseName: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "master_admin") {
    return { ok: false, error: "Only staff can select a course." };
  }
  const name = courseName.trim();
  if (!name) return { ok: false, error: "Choose a course." };
  if (!(await isValidCourse(name))) return { ok: false, error: "Please choose a valid course." };

  const [row] = await db()
    .select({ id: users.id, topic: users.topic, name: users.name })
    .from(users)
    .where(eq(users.id, user.id ?? ""))
    .limit(1);
  if (!row) return { ok: false, error: "Account not found." };

  if (row.topic && row.topic !== name) {
    // Already selected — only the master admin can change it now.
    return { ok: false, error: `Your course is locked to ${row.topic}. Only the master admin can change it.` };
  }

  try {
    await db().update(users).set({ topic: name }).where(eq(users.id, row.id));
  } catch {
    return { ok: false, error: "Could not save your course. Try again." };
  }

  await recordAudit({
    actorId: row.id,
    actorName: row.name ?? null,
    actorRole: user.role,
    action: "updated",
    entityType: "staff",
    entityId: row.id,
    summary: `Selected their course: ${name}`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true, message: `Your course is set to ${name}.` };
}
