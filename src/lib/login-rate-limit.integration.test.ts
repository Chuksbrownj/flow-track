/**
 * Integration tests for the login rate-limit flow against a REAL database.
 *
 * Run with `npm run test:integration` (separate vitest config). Uses
 * `DATABASE_URL` from `.env.local` when present and SKIPS otherwise, so CI
 * without a database is unaffected. Writes only uniquely-prefixed
 * `rate_limits` rows and deletes them afterwards.
 *
 * The `authenticate` action is tested with only `signIn` mocked — the real
 * `checkRateLimit` / `recordRateLimitFailure` calls hit the actual database,
 * and the NextAuth handshake itself is out of scope for vitest.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { authenticate } from "@/app/login/actions";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

// Load .env.local like scripts/seed.ts does, so local runs hit the real DB.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI or no local env file — the describe blocks below will skip.
}

vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("next-auth", () => {
  class AuthError extends Error {
    type = "CredentialsSignin";
  }
  return { AuthError };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  // Fixed IP so the login action's ip-based key is deterministic.
  return { ...actual, clientIp: async () => "198.51.100.10" };
});

const hasDb = Boolean(process.env.DATABASE_URL);
const describeWithDb = hasDb ? describe : describe.skip;

const PREFIX = `itest:${Date.now()}:`;
const createdKeys: string[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clear(key: string) {
  await db().delete(rateLimits).where(eq(rateLimits.key, key)).catch(() => {});
}

function loginForm(identifier: string, password: string): FormData {
  const form = new FormData();
  form.set("identifier", identifier);
  form.set("password", password);
  return form;
}

afterAll(async () => {
  if (!hasDb) return;
  for (const key of createdKeys) {
    await db().delete(rateLimits).where(eq(rateLimits.key, key)).catch(() => {});
  }
  await db().delete(rateLimits).where(like(rateLimits.key, `${PREFIX}%`)).catch(() => {});
});

describeWithDb("rateLimit against a real database", () => {
  it("increments within the window and blocks past the limit", async () => {
    const key = `${PREFIX}increment`;
    const { rateLimit } = await import("@/lib/rate-limit");
    await clear(key);

    expect((await rateLimit(key, 2, 60_000)).ok).toBe(true); // count 1
    expect((await rateLimit(key, 2, 60_000)).ok).toBe(true); // count 2
    const third = await rateLimit(key, 2, 60_000); // count 3 > 2
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    const [row] = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, key));
    expect(row?.count).toBe(3);
  });

  it("resets the counter when the window expires (permanent-lockout regression)", async () => {
    const key = `${PREFIX}expiry`;
    const { rateLimit } = await import("@/lib/rate-limit");
    const windowMs = 1_200;
    await clear(key);

    expect((await rateLimit(key, 1, windowMs)).ok).toBe(true); // count 1
    expect((await rateLimit(key, 1, windowMs)).ok).toBe(false); // count 2 > 1
    await sleep(windowMs + 400); // let the window expire
    expect((await rateLimit(key, 1, windowMs)).ok).toBe(true); // reset to count 1
  });
});

describeWithDb("checkRateLimit / recordRateLimitFailure against a real database", () => {
  it("check does not count and failure recording drives the block", async () => {
    const key = `${PREFIX}checkrecord`;
    const { checkRateLimit, recordRateLimitFailure } = await import("@/lib/rate-limit");
    await clear(key);

    expect((await checkRateLimit(key, 2)).ok).toBe(true);
    // A pure check must not create a counter row.
    const afterCheck = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, key));
    expect(afterCheck).toHaveLength(0);

    await recordRateLimitFailure(key, 60_000); // count 1
    await recordRateLimitFailure(key, 60_000); // count 2
    expect((await checkRateLimit(key, 2)).ok).toBe(true); // 2 <= 2
    const blocked = await checkRateLimit(key, 1); // 2 > 1
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("resets the failure counter once the window expires", async () => {
    const key = `${PREFIX}recordexpiry`;
    const { checkRateLimit, recordRateLimitFailure } = await import("@/lib/rate-limit");
    const windowMs = 1_200;
    await clear(key);

    await recordRateLimitFailure(key, windowMs); // count 1
    expect((await checkRateLimit(key, 1)).ok).toBe(true); // 1 <= 1
    await sleep(windowMs + 400);
    await recordRateLimitFailure(key, windowMs); // expired -> reset to count 1
    expect((await checkRateLimit(key, 1)).ok).toBe(true);
    // And the counter did not keep climbing past the reset.
    const [row] = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, key));
    expect(row?.count).toBe(1);
  });
});

describeWithDb("authenticate login rate-limit flow (real DB, signIn mocked)", () => {
  const identifier = "itest-login@example.com";
  const idKey = `login:identifier:${identifier}`;
  const ipKey = "login:ip:198.51.100.10";

  beforeEach(() => {
    createdKeys.push(idKey, ipKey);
  });

  afterEach(() => {
    vi.mocked(signIn).mockReset();
  });

  it("records failed attempts and gates before signIn once the limit is hit", async () => {
    await clear(idKey);
    await clear(ipKey);

    for (let i = 0; i < 11; i += 1) {
      vi.mocked(signIn).mockRejectedValueOnce(new AuthError("bad credentials"));
      const message = await authenticate(undefined, loginForm(identifier, "wrong"));
      expect(message).toBe("Invalid email/registration code or password.");
    }

    // Attempt #12 is gated by the identifier limiter BEFORE signIn runs.
    const blocked = await authenticate(undefined, loginForm(identifier, "wrong"));
    expect(blocked).toMatch(/Too many sign-in attempts/);
    expect(vi.mocked(signIn)).toHaveBeenCalledTimes(11);

    const [row] = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, idKey));
    expect(row?.count).toBe(11);
  });

  it("a successful sign-in does not count toward the limit", async () => {
    await clear(idKey);
    await clear(ipKey);

    vi.mocked(signIn).mockRejectedValueOnce(new AuthError("bad"));
    await authenticate(undefined, loginForm(identifier, "wrong")); // count 1

    vi.mocked(signIn).mockResolvedValueOnce(undefined);
    const result = await authenticate(undefined, loginForm(identifier, "right"));
    expect(result).toBeUndefined();

    const [row] = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, idKey));
    expect(row?.count).toBe(1); // unchanged by the success
  });
});
