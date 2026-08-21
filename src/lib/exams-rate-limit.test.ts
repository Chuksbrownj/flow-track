// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn((fn) => fn()) }));

vi.mock("@/lib/auth-guard", () => ({
  requireUser: vi.fn(async () => ({ id: "student-1", role: "student" })),
  requireStaff: vi.fn(),
  requireMasterAdmin: vi.fn(),
}));

// The actions rate-limit BEFORE touching the database, so a rate-limited call
// must fail fast without a single query.
vi.mock("@/db/client", () => ({
  db: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: vi.fn(async () => []) }) }),
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

// Import after the mocks are registered so the actions see the mocked deps.
import { recordViolation, saveAnswer, submitExam } from "@/lib/actions/exams";
import { rateLimit } from "@/lib/rate-limit";

const USER_ID = "student-1";
// The actions validate the exam id before rate-limiting, so use a real UUID.
const EXAM_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.mocked(rateLimit).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("exam actions respect per-user rate limits", () => {
  it("saveAnswer rejects a rate-limited user before any database work", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });

    const result = await saveAnswer(EXAM_ID, { q1: "a" }, 1);

    expect(result).toEqual({ ok: false, error: "Too many saves. Try again shortly." });
    expect(rateLimit).toHaveBeenCalledWith(`exam:save:${USER_ID}`, 60, 60_000);
  });

  it("recordViolation rejects a rate-limited user", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });

    const result = await recordViolation(EXAM_ID);

    expect(result).toEqual({ ok: false, error: "Too many window switches. Slow down." });
    expect(rateLimit).toHaveBeenCalledWith(`exam:violation:${USER_ID}`, 30, 60_000);
  });

  it("submitExam rejects a rate-limited user (double-submit / abuse guard)", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30 });

    const result = await submitExam(EXAM_ID);

    expect(result).toEqual({ ok: false, error: "You already submitted. Refresh to see your result." });
    expect(rateLimit).toHaveBeenCalledWith(`exam:submit:${USER_ID}`, 5, 60_000);
  });

  it("lets an unlimited user through to the normal flow", async () => {
    const result = await saveAnswer(EXAM_ID, { q1: "a" }, 1);

    // Not rate-limited → proceeds past the guard (returns the "Exam not found"
    // error from the mocked empty DB, proving the rate limiter didn't block).
    expect(result).toEqual({ ok: false, error: "Exam not found." });
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });
});
