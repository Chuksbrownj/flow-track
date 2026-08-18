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
  | "course_added"
  | "ticket_resolved"
  | "ticket_reopened";

export type AuditEntityType =
  | "trainee"
  | "attendance"
  | "score_sheet"
  | "schedule"
  | "staff"
  | "exam"
  | "profile"
  | "auth"
  | "course"
  | "support";

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
              eq(auditLogs.entityType, "profile"),
              eq(auditLogs.entityType, "support")
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

/**
 * Human-readable labels, keyed by the typed union so TypeScript fails the
 * build if a new action/entity is added without a label.
 */
const ENTITY_LABELS: Record<AuditEntityType, string> = {
  trainee: "Trainee",
  attendance: "Attendance",
  score_sheet: "Score sheet",
  schedule: "Schedule",
  staff: "Staff",
  exam: "Exam",
  profile: "Profile",
  auth: "Account",
  course: "Course",
  support: "Support ticket",
};

const ACTION_LABELS: Record<AuditAction, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  approved: "approved",
  status: "changed status",
  device_reset: "reset device binding",
  checkin: "checked in",
  attendance_marked: "marked attendance",
  attendance_confirmed: "confirmed attendance",
  scores_saved: "saved scores",
  exam_created: "created exam",
  exam_updated: "updated exam",
  exam_deleted: "deleted exam",
  exam_opened: "opened exam",
  exam_closed: "closed exam",
  exam_reopened: "reopened exam",
  exam_graded: "graded exam",
  exam_override: "granted exam override",
  password_reset: "reset password",
  role_promoted: "promoted",
  suspended: "suspended",
  restored: "restored",
  suspend_requested: "requested suspension",
  suspend_confirmed: "confirmed suspension",
  suspend_rejected: "rejected suspension request",
  course_added: "added course",
  ticket_resolved: "resolved",
  ticket_reopened: "reopened",
};

/**
 * Human-readable label for an action/entity combination. Unknown values
 * (e.g. actions logged before this label set existed) fall back to the raw
 * action/entity names.
 */
export function describeAudit(row: AuditLogRow): string {
  const entity = ENTITY_LABELS[row.entityType as AuditEntityType] ?? "Account";
  const action = ACTION_LABELS[row.action as AuditAction] ?? row.action;
  return `${entity} ${action}`;
}

export function roleLabel(role: string | null): string {
  if (role === "master_admin") return "Master admin";
  if (role === "admin") return "Admin";
  if (role === "student") return "Student";
  return role ?? "";
}
