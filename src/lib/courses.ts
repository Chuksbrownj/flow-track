import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { courses } from "@/db/schema";

export type CourseRow = { id: string; name: string };

/**
 * Lists the active programme courses (database-driven — the score sheet
 * columns and exam topic options are built from these).
 */
export async function listCourses(activeOnly = true): Promise<CourseRow[]> {
  const rows = await db()
    .select({ id: courses.id, name: courses.name })
    .from(courses)
    .where(activeOnly ? eq(courses.active, true) : undefined)
    .orderBy(asc(courses.name));
  return rows;
}

/** Names of the active courses (used for validation). */
export async function listCourseNames(activeOnly = true): Promise<string[]> {
  const rows = await listCourses(activeOnly);
  return rows.map((row) => row.name);
}

/** True when the value is the name of an active course. */
export async function isValidCourse(name: string, activeOnly = true): Promise<boolean> {
  const names = await listCourseNames(activeOnly);
  return names.includes(name);
}

/** True when the course id exists and is active. */
export async function isValidCourseId(id: string, activeOnly = true): Promise<boolean> {
  const [row] = await db()
    .select({ id: courses.id })
    .from(courses)
    .where(activeOnly ? and(eq(courses.id, id), eq(courses.active, true)) : eq(courses.id, id))
    .limit(1);
  return !!row;
}
