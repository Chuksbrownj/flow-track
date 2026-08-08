import { desc, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { traineeChangeLogs, trainees, users } from "@/db/schema";

/** Each log entry lives for 5 days, then is purged. */
export const TRAINEE_LOG_TTL_DAYS = 5;

export type TraineeLogAction =
  | "created"
  | "updated"
  | "approved"
  | "status"
  | "device_reset";

export type TraineeLogRow = {
  id: string;
  traineeId: string;
  traineeName: string;
  registrationNumber: string | null;
  action: TraineeLogAction;
  field: string | null;
  before: string | null;
  after: string | null;
  actorName: string | null;
  createdAt: string;
};

/**
 * Records one change to a trainee's details (call after the change is saved).
 */
export async function recordTraineeChange(input: {
  traineeId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: TraineeLogAction;
  field?: string | null;
  before?: string | null;
  after?: string | null;
}) {
  try {
    await db().insert(traineeChangeLogs).values({
      traineeId: input.traineeId,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      field: input.field ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });
  } catch (error) {
    // Logging must never break the underlying operation.
    console.error("recordTraineeChange: could not write log", error);
  }
}

/**
 * Removes log entries older than 5 days. Idempotent; call it before reading
 * the history so expired entries are cleared "per change" as requested.
 */
export async function purgeTraineeLogs() {
  const cutoff = new Date(Date.now() - TRAINEE_LOG_TTL_DAYS * 24 * 60 * 60 * 1000);
  try {
    await db().delete(traineeChangeLogs).where(lt(traineeChangeLogs.createdAt, cutoff));
  } catch (error) {
    console.error("purgeTraineeLogs: could not purge old logs", error);
  }
}

/** Lists the change history, newest first, with trainee and actor names. */
export async function listTraineeLogs(limit = 200): Promise<TraineeLogRow[]> {
  await purgeTraineeLogs();

  const [logRows, traineeRows, userRows] = await Promise.all([
    db()
      .select()
      .from(traineeChangeLogs)
      .orderBy(desc(traineeChangeLogs.createdAt))
      .limit(limit),
    db().select().from(trainees),
    db().select({ id: users.id, name: users.name }).from(users),
  ]);

  const traineeById = new Map(traineeRows.map((row) => [row.id, row]));
  const userNameById = new Map(userRows.map((row) => [row.id, row.name]));

  return logRows.map((row) => {
    const trainee = traineeById.get(row.traineeId);
    return {
      id: row.id,
      traineeId: row.traineeId,
      traineeName: trainee?.fullName ?? "Deleted trainee",
      registrationNumber: trainee?.registrationNumber ?? null,
      action: row.action as TraineeLogAction,
      field: row.field,
      before: row.before,
      after: row.after,
      actorName: row.actorName ?? (row.actorId ? userNameById.get(row.actorId) ?? null : null),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Human-readable label for a change action/field combination. */
export function describeTraineeChange(row: TraineeLogRow): string {
  const fieldLabel =
    row.field === "registrationNumber"
      ? "Registration number"
      : row.field === "fullName"
        ? "Full name"
        : row.field === "gender"
          ? "Gender"
          : row.field === "phone"
            ? "Phone"
            : row.field === "email"
              ? "Email"
              : row.field === "status"
                ? "Status"
                : row.field ?? "";

  switch (row.action) {
    case "created":
      return "Trainee added";
    case "approved":
      return "Registration approved";
    case "status":
      return `Status changed to ${row.after ?? ""}`;
    case "device_reset":
      return "Device binding reset";
    case "updated":
      return row.before === null
        ? `${fieldLabel} set to ${row.after ?? ""}`
        : `${fieldLabel}: ${row.before ?? "—"} → ${row.after ?? "—"}`;
    default:
      return fieldLabel || "Details changed";
  }
}
