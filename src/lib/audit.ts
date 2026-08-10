import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "approved"
  | "status"
  | "device_reset"
  | "checkin"
  | "attendance_marked"
  | "attendance_confirmed"
  | "scores_saved"
  | "exam_created"
  | "exam_updated"
  | "exam_deleted"
  | "exam_opened"
  | "exam_closed"
  | "exam_reopened"
  | "exam_graded"
  | "exam_override"
  | "password_reset"
  | "role_promoted"
  | "suspended"
  | "restored"
  | "suspend_requested"
  | "suspend_confirmed"
  | "suspend_rejected"
  | "course_added";

export type AuditEntityType =
  | "trainee"
  | "attendance"
  | "score_sheet"
  | "schedule"
  | "staff"
  | "exam"
  | "profile"
  | "auth"
  | "course";

export type AuditLogRow = {
  id: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
};

/**
 * Records one data-changing action. Never throws — logging must not break the
 * underlying operation.
 */
export async function recordAudit(input: {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  summary: string;
}) {
  try {
    await db().insert(auditLogs).values({
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
    });
  } catch (error) {
    console.error("recordAudit: could not write audit log", error);
  }
}

/**
 * Lists audit entries, newest first.
 *
 * - Admins (trainers) only see entries involving students (actions performed by
 *   students, or actions on student data).
 * - Master admins see everything.
 */
export async function listAuditLogs(opts: {
  role: string;
  limit?: number;
}): Promise<AuditLogRow[]> {
  const limit = opts.limit ?? 200;

  const rows =
    opts.role === "master_admin"
      ? await db().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit)
      : await db()
          .select()
          .from(auditLogs)
          .where(
            or(
              eq(auditLogs.actorRole, "student"),
              eq(auditLogs.entityType, "trainee"),
              eq(auditLogs.entityType, "attendance"),
              eq(auditLogs.entityType, "score_sheet"),
              eq(auditLogs.entityType, "profile")
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    actorName: row.actorName,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Human-readable label for an action/entity combination. */
export function describeAudit(row: AuditLogRow): string {
  const entity =
    row.entityType === "trainee"
      ? "Trainee"
      : row.entityType === "attendance"
        ? "Attendance"
        : row.entityType === "score_sheet"
          ? "Score sheet"
          : row.entityType === "schedule"
            ? "Schedule"
            : row.entityType === "staff"
              ? "Staff"
              : row.entityType === "exam"
                ? "Exam"
                : row.entityType === "profile"
                  ? "Profile"
                  : row.entityType === "course"
                    ? "Course"
                    : "Account";
  const action =
    row.action === "created"
      ? "created"
      : row.action === "updated"
        ? "updated"
        : row.action === "deleted"
          ? "deleted"
          : row.action === "approved"
            ? "approved"
            : row.action === "status"
              ? "changed status"
              : row.action === "device_reset"
                ? "reset device binding"
                : row.action === "checkin"
                  ? "checked in"
                  : row.action === "attendance_marked"
                    ? "marked attendance"
                    : row.action === "attendance_confirmed"
                      ? "confirmed attendance"
                      : row.action === "scores_saved"
                        ? "saved scores"
                        : row.action === "exam_created"
                          ? "created exam"
                          : row.action === "exam_updated"
                            ? "updated exam"
                            : row.action === "exam_deleted"
                              ? "deleted exam"                                  : row.action === "exam_opened"
                                    ? "opened exam"
                                    : row.action === "exam_closed"
                                      ? "closed exam"
                                      : row.action === "exam_reopened"
                                        ? "reopened exam"
                                      : row.action === "exam_graded"
                                        ? "graded exam"
                                        : row.action === "exam_override"
                                          ? "granted exam override"
                                          : row.action === "password_reset"
                                            ? "reset password"
                                            : row.action === "role_promoted"
                                              ? "promoted"
                                              : row.action === "suspended"
                                                ? "suspended"
                                              : row.action === "restored"
                                                ? "restored"
                                              : row.action === "suspend_requested"
                                                ? "requested suspension"
                                              : row.action === "suspend_confirmed"
                                                ? "confirmed suspension"
                                              : row.action === "suspend_rejected"
                                                ? "rejected suspension request"
                                              : row.action === "course_added"
                                                ? "added course"
                                              : row.action;
  return `${entity} ${action}`;
}

export function roleLabel(role: string | null): string {
  if (role === "master_admin") return "Master admin";
  if (role === "admin") return "Admin";
  if (role === "student") return "Student";
  return role ?? "";
}
