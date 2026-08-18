/**
 * Ad-hoc end-to-end check for the admin-created-trainee login flow:
 * createTrainee (real action) -> real DB -> simulate the authorize lookup
 * from src/auth.ts. Only the auth guard (requireStaff) is mocked.
 *
 * Not part of the default suite (integration config). Run with:
 *   npx vitest run --config vitest.integration.config.ts src/lib/trainee-create.integration.test.ts
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";

const reg = "9001";
const email = "itest9001@example.com";
const password = "TestPass123!";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Fully mock the auth guard (next-auth fails to load under vitest). The
// mocked actor is a real master admin so FK constraints on audit/log rows hold.
vi.mock("@/lib/auth-guard", () => ({
  requireStaff: vi.fn(async () => {
    const [admin] = await db()
      .select()
      .from(users)
      .where(eq(users.role, "master_admin"))
      .limit(1);
    return { id: admin.id, name: admin.name ?? null, role: admin.role };
  }),
  requireMasterAdmin: vi.fn(async () => {
    const [admin] = await db()
      .select()
      .from(users)
      .where(eq(users.role, "master_admin"))
      .limit(1);
    return { id: admin.id, name: admin.name ?? null, role: admin.role };
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: vi.fn(async () => "127.0.0.1"),
  rateLimit: vi.fn(async () => ({ ok: true })),
}));

// Assert createTrainee triggers the credentials email (the real send path is
// verified separately against the Brevo API).
const sendStudentCredentialsEmail = vi.fn(async () => true);
vi.mock("@/lib/email", () => ({ sendStudentCredentialsEmail }));

const { createTrainee, updateTrainee } = await import("@/lib/actions/trainees");

async function cleanup() {
  const [prev] = await db()
    .select({ id: trainees.id, userId: trainees.userId })
    .from(trainees)
    .where(eq(trainees.registrationNumber, reg))
    .limit(1);
  if (prev) {
    if (prev.userId) await db().delete(users).where(eq(users.id, prev.userId)).catch(() => {});
    await db().delete(trainees).where(eq(trainees.id, prev.id)).catch(() => {});
  }
  const [byEmail] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (byEmail) await db().delete(users).where(eq(users.id, byEmail.id)).catch(() => {});
}

describe("admin-created trainee login flow (real DB)", () => {
  beforeEach(() => {
    sendStudentCredentialsEmail.mockClear();
    return cleanup();
  });
  afterEach(cleanup);

  it("creates a linked account whose password works for login", async () => {
    const fd = new FormData();
    fd.set("registrationNumber", reg);
    fd.set("fullName", "Integration Test Trainee");
    fd.set("gender", "Female");
    fd.set("phone", "08000000000");
    fd.set("email", email);
    fd.set("password", password);
    fd.set("confirmPassword", password);

    const result = await createTrainee(fd);
    expect(result.ok).toBe(true);

    const [trainee] = await db()
      .select()
      .from(trainees)
      .where(eq(trainees.registrationNumber, reg))
      .limit(1);
    expect(trainee).toBeDefined();
    expect(trainee.userId).toBeTruthy();

    const [user] = await db().select().from(users).where(eq(users.id, trainee.userId!)).limit(1);
    expect(user.role).toBe("student");
    expect(user.passwordHash).toBeTruthy();

    // Simulate the exact lookup in src/auth.ts (registration-number path).
    const [found] = await db()
      .select({ userId: trainees.userId })
      .from(trainees)
      .where(eq(trainees.registrationNumber, reg))
      .limit(1);
    const [foundUser] = await db().select().from(users).where(eq(users.id, found.userId!)).limit(1);
    expect(await bcrypt.compare(password, foundUser.passwordHash)).toBe(true);
    expect(await bcrypt.compare("WrongPass123!", foundUser.passwordHash)).toBe(false);

    // Email path also resolves to the same account.
    const [byEmail] = await db().select().from(users).where(eq(users.email, email)).limit(1);
    expect(byEmail?.id).toBe(user.id);

    // The credentials email is triggered with the sign-in details.
    expect(sendStudentCredentialsEmail).toHaveBeenCalledWith(
      email,
      "Integration Test Trainee",
      reg,
      email,
      password
    );
  });

  it("edit flow creates an account for an accountless trainee", async () => {
    // Throwaway master admin with a known password (real hash, real compare).
    const adminPass = "AdminPass123!";
    const [admin] = await db()
      .insert(users)
      .values({
        name: "Integration Test Admin",
        email: "itest-admin@example.com",
        passwordHash: await bcrypt.hash(adminPass, 10),
        role: "master_admin",
      })
      .returning({ id: users.id, name: users.name, role: users.role });

    // Point the mocked guard at this admin (shape matches the auth() session).
    const { requireMasterAdmin } = await import("@/lib/auth-guard");
    vi.mocked(requireMasterAdmin).mockResolvedValue({
      id: admin.id,
      name: admin.name ?? null,
      role: admin.role,
      topic: null,
    } as never);

    // Seed a trainee with no linked account (legacy record).
    const [seeded] = await db()
      .insert(trainees)
      .values({
        registrationNumber: reg,
        fullName: "Legacy Trainee",
        gender: "Male",
        phone: "08011111111",
        email: email,
        status: "active",
        userId: null,
      })
      .returning({ id: trainees.id });

    const fd = new FormData();
    fd.set("registrationNumber", reg);
    fd.set("fullName", "Legacy Trainee");
    fd.set("gender", "Male");
    fd.set("phone", "08011111111");
    fd.set("email", email);
    fd.set("password", password);
    fd.set("confirmPassword", password);

    const result = await updateTrainee(seeded.id, adminPass, fd);
    expect(result.ok).toBe(true);

    const [after] = await db()
      .select()
      .from(trainees)
      .where(eq(trainees.id, seeded.id))
      .limit(1);
    expect(after.userId).toBeTruthy();

    const [account] = await db().select().from(users).where(eq(users.id, after.userId!)).limit(1);
    expect(account.role).toBe("student");
    expect(await bcrypt.compare(password, account.passwordHash)).toBe(true);

    // The credentials email is triggered with the sign-in details.
    expect(sendStudentCredentialsEmail).toHaveBeenCalledWith(
      email,
      "Legacy Trainee",
      reg,
      email,
      password
    );

    // Remove the throwaway admin.
    await db().delete(users).where(eq(users.id, admin.id)).catch(() => {});
  });
});
