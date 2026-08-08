"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { attendance, trainees, users } from "@/db/schema";
import { requireStaff, requireUser } from "@/lib/auth-guard";
import { attendanceEditable, isCheckinOpen, todayStr } from "@/lib/date";

export type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  /** True when the device is not registered and the account password is required. */
  needsPassword?: boolean;
};

function validDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayStr();
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "";
}

function isFingerprint(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Trainee self check-in. Binds the device fingerprint + IP on first use and
 * requires the same device fingerprint and IP on every later check-in.
 * Creates a "pending" attendance record that a trainer must confirm.
 *
 * If no fingerprint is registered yet (first device, or after a trainer reset),
 * the trainee must verify with their account password before the device is
 * bound and the check-in is recorded.
 */
export async function checkInAttendance(
  fingerprint: string,
  password?: string
): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "trainee") return { ok: false, error: "Only trainees can check in." };

  const fp = fingerprint.trim().toLowerCase();
  if (!isFingerprint(fp)) return { ok: false, error: "Device signature is invalid." };

  const [trainee] = await db()
    .select()
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);
  if (!trainee) return { ok: false, error: "No trainee profile is linked to this account." };
  if (trainee.status !== "active") {
    return { ok: false, error: "Your account is not active yet." };
  }

  const day = todayStr();
  const [existing] = await db()
    .select()
    .from(attendance)
    .where(and(eq(attendance.traineeId, trainee.id), eq(attendance.date, day)))
    .limit(1);

  // Already signed for today — no re-sign, whatever the time.
  if (existing) {
    if (existing.status === "present" || existing.status === "absent") {
      return { ok: true, error: undefined, message: `Attendance already recorded as ${existing.status}.` };
    }
    return { ok: true, error: undefined, message: "Already checked in — waiting for trainer confirmation." };
  }

  // Sign-in stays open until 6pm GMT.
  if (!isCheckinOpen()) {
    return { ok: false, error: "Sign-in for today closed at 6pm GMT. Contact a trainer if you need help." };
  }

  const ip = await clientIp();

  // Device has no registered fingerprint yet: require the account password to
  // prove identity, then bind this device to the trainee.
  if (!trainee.deviceFingerprint) {
    const [holder] = await db()
      .select({ id: trainees.id })
      .from(trainees)
      .where(and(eq(trainees.deviceFingerprint, fp), ne(trainees.id, trainee.id)))
      .limit(1);
    if (holder) {
      return { ok: false, error: "This device is already registered to another trainee." };
    }

    const provided = (password ?? "").trim();
    if (!provided) {
      return {
        ok: false,
        needsPassword: true,
        error: "This device is not registered to your account. Sign in with your account password to register it and check in.",
      };
    }

    const [userRow] = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!userRow) return { ok: false, error: "Account not found." };

    const valid = await bcrypt.compare(provided, userRow.passwordHash);
    if (!valid) return { ok: false, error: "Incorrect password." };

    try {
      await db()
        .update(trainees)
        .set({ deviceFingerprint: fp, deviceIp: ip, updatedAt: new Date() })
        .where(eq(trainees.id, trainee.id));
    } catch {
      return { ok: false, error: "Could not register this device. Try again." };
    }
  } else if (trainee.deviceFingerprint !== fp) {
    return {
      ok: false,
      error: "Check in from your registered device only. Another trainee's device cannot be used.",
    };
  } else if (trainee.deviceIp && trainee.deviceIp !== ip) {
    return {
      ok: false,
      error: "Check in from your registered network address. Ask a trainer if your network changed.",
    };
  }

  try {
    await db()
      .insert(attendance)
      .values({ traineeId: trainee.id, date: day, status: "pending", source: "device" });
  } catch {
    return { ok: false, error: "Could not check in. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/portal");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true, error: undefined, message: "Checked in! A trainer will confirm your attendance." };
}

/**
 * Trainer confirmation of a pending auto check-in (works from any IP/device).
 */
export async function confirmAttendance(
  traineeId: string,
  status: "present" | "absent",
  date?: string
): Promise<ActionResult> {
  const admin = await requireStaff();
  if (status !== "present" && status !== "absent") return { ok: false, error: "Invalid status." };

  const day = validDate(date);

  if (!attendanceEditable(day)) {
    return {
      ok: false,
      error: "Attendance for this date can no longer be changed (the 72-hour window has passed).",
    };
  }

  const [existing] = await db()
    .select({ id: attendance.id, status: attendance.status, source: attendance.source })
    .from(attendance)
    .where(and(eq(attendance.traineeId, traineeId), eq(attendance.date, day)))
    .limit(1);
  if (!existing) return { ok: false, error: "No check-in record found for this trainee on this date." };

  try {
    await db()
      .update(attendance)
      .set({
        status,
        confirmedById: admin.id ?? null,
        confirmedAt: new Date(),
        source: existing.status === "pending" ? "device" : existing.source,
      })
      .where(eq(attendance.id, existing.id));
  } catch {
    return { ok: false, error: "Could not confirm attendance. Try again." };
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Trainer reset of a trainee's device binding (e.g. lost device / network change).
 */
export async function resetDeviceBinding(traineeId: string): Promise<ActionResult> {
  await requireStaff();
  try {
    await db()
      .update(trainees)
      .set({ deviceFingerprint: null, deviceIp: null, updatedAt: new Date() })
      .where(eq(trainees.id, traineeId));
  } catch {
    return { ok: false, error: "Could not reset the device binding. Try again." };
  }
  revalidatePath("/attendance");
  revalidatePath("/trainees");
  return { ok: true };
}

/**
 * Manual attendance marking by a trainer (unchanged behaviour, now with audit fields).
 */
export async function markAttendance(
  traineeId: string,
  status: "present" | "absent",
  date?: string
): Promise<ActionResult> {
  const admin = await requireStaff();

  if (status !== "present" && status !== "absent") {
    return { ok: false, error: "Invalid status." };
  }

  const day = validDate(date);

  if (!attendanceEditable(day)) {
    return {
      ok: false,
      error: "Attendance for this date can no longer be changed (the 72-hour window has passed).",
    };
  }

  const [trainee] = await db()
    .select({ id: trainees.id })
    .from(trainees)
    .where(and(eq(trainees.id, traineeId), eq(trainees.status, "active")))
    .limit(1);
  if (!trainee) {
    return { ok: false, error: "Trainee not found or inactive." };
  }

  try {
    const [existing] = await db()
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.traineeId, traineeId), eq(attendance.date, day)))
      .limit(1);

    if (existing) {
      await db()
        .update(attendance)
        .set({ status, confirmedById: admin.id ?? null, confirmedAt: new Date() })
        .where(eq(attendance.id, existing.id));
    } else {
      await db()
        .insert(attendance)
        .values({
          traineeId,
          date: day,
          status,
          source: "manual",
          confirmedById: admin.id ?? null,
          confirmedAt: new Date(),
        });
    }
  } catch {
    return { ok: false, error: "Could not save attendance. Try again." };
  }

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/portal");
  return { ok: true };
}
