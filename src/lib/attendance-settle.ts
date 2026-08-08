import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { attendance, trainees } from "@/db/schema";
import { currentMonth, daysAgoStr, isCheckinOpen, todayStr } from "@/lib/date";

/**
 * Brings attendance records in line with the daily rules (idempotent):
 * - once the 6pm sign-in window has closed, active trainees with no record
 *   for that day are marked absent automatically;
 * - pending auto check-ins that a trainer never confirmed within the
 *   72-hour edit window are marked absent.
 *
 * Backfills every closed day of the current month (plus today once 6pm has
 * passed), so no-sign days become absent even if nobody opens the app for a
 * while. Called lazily from pages that read attendance.
 */
export async function settleAttendance() {
  const today = todayStr();
  const yesterday = daysAgoStr(1);

  // Unconfirmed check-ins older than the 72-hour edit window become absent.
  await db()
    .update(attendance)
    .set({ status: "absent" })
    .where(and(eq(attendance.status, "pending"), lt(attendance.date, daysAgoStr(3))));

  // Days whose sign-in window has closed: every day of the current month up
  // to yesterday, plus today once 6pm GMT has passed.
  const closedDays: string[] = [];
  const [y, m] = currentMonth().split("-").map(Number);
  const cursor = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  const end = new Date(`${yesterday}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    closedDays.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
        cursor.getUTCDate()
      ).padStart(2, "0")}`
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!isCheckinOpen()) closedDays.push(today);

  if (closedDays.length === 0) return;

  const [traineeRows, recordRows] = await Promise.all([
    db()
      .select({ id: trainees.id, createdAt: trainees.createdAt })
      .from(trainees)
      .where(eq(trainees.status, "active")),
    db()
      .select({ traineeId: attendance.traineeId, date: attendance.date })
      .from(attendance)
      .where(gte(attendance.date, `${currentMonth()}-01`)),
  ]);

  const recorded = new Set(recordRows.map((row) => `${row.traineeId}|${row.date}`));
  const missing: { traineeId: string; date: string; status: "absent"; source: "auto" }[] = [];

  for (const trainee of traineeRows) {
    const firstDay = todayStr(trainee.createdAt);
    for (const day of closedDays) {
      if (day < firstDay) continue; // not a trainee on that day yet
      if (recorded.has(`${trainee.id}|${day}`)) continue;
      missing.push({ traineeId: trainee.id, date: day, status: "absent", source: "auto" });
    }
  }

  if (missing.length > 0) {
    // The unique (trainee, date) index guards concurrent settles; other errors
    // (e.g. connection failures) are logged so a failed settle is not silent.
    await db()
      .insert(attendance)
      .values(missing)
      .catch((error) => {
        console.error("settleAttendance: could not insert auto-absent records", error);
      });
  }
}
