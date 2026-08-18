import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockCalls } = vi.hoisted(() => {
  const mockCalls = {
    deleteWhere: 0,
    upserts: 0,
    setClause: null as null | { count: unknown; resetAt: unknown },
  };
  const mockDb: {
    sweepThrows: boolean;
    insert: () => unknown;
    delete: () => unknown;
  } = {
    sweepThrows: false,
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (options: { set: { count: unknown; resetAt: unknown } }) => {
          mockCalls.setClause = options.set;
          return {
            returning: async () => {
              mockCalls.upserts += 1;
              return [{ count: 1, resetAt: new Date(Date.now() + 60_000) }];
            },
          };
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: async () => {
          if (mockDb.sweepThrows) throw new Error("db down");
          mockCalls.deleteWhere += 1;
          return [{ key: "expired-key" }];
        },
      }),
    }),
  };
  return { mockDb, mockCalls };
});

vi.mock("@/db/client", () => ({ db: () => mockDb }));

import { rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  mockCalls.deleteWhere = 0;
  mockCalls.upserts = 0;
  mockCalls.setClause = null;
  mockDb.sweepThrows = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rateLimit opportunistic sweep", () => {
  it("sweeps expired rows when the probability triggers", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always sweep

    const result = await rateLimit("test:key", 5, 60_000);

    expect(result).toEqual({ ok: true });
    expect(mockCalls.deleteWhere).toBe(1);
    expect(mockCalls.upserts).toBe(1);
  });

  it("skips the sweep when the probability does not trigger", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // never sweep

    const result = await rateLimit("test:key", 5, 60_000);

    expect(result).toEqual({ ok: true });
    expect(mockCalls.deleteWhere).toBe(0);
    expect(mockCalls.upserts).toBe(1);
  });

  it("still enforces the limit", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    // The mock always returns count 1, so a limit of 0 must block the request.
    const result = await rateLimit("test:key", 0, 60_000);

    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("resets the counter to 1 when the window has expired", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    await rateLimit("test:key", 5, 60_000);

    // Regressions: an expired window must start a fresh window (count 1)
    // instead of incrementing forever, so a lockout can never become permanent.
    // The literal SQL text lives in the template's queryChunks as string
    // chunks; params (columns/dates) are skipped.
    const sqlText = (value: unknown) => {
      const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
      return chunks
        .map((chunk) => {
          const inner = (chunk as { value?: unknown }).value;
          if (Array.isArray(inner)) {
            return inner.filter((x): x is string => typeof x === "string").join("");
          }
          return "";
        })
        .join("");
    };
    const countSql = sqlText(mockCalls.setClause?.count);
    const resetAtSql = sqlText(mockCalls.setClause?.resetAt);
    expect(countSql).toContain("THEN 1 ELSE");
    expect(countSql).not.toContain("THEN 1 + 1");
    expect(resetAtSql).toContain("THEN");
  });

  it("a failing sweep does not break the rate-limit decision", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always sweep
    mockDb.sweepThrows = true;

    const result = await rateLimit("test:key", 5, 60_000);

    expect(result).toEqual({ ok: true });
  });
});
