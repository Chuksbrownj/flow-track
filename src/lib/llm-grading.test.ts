import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGradeJson,
  sanitizeLlmGrades,
  suggestWrittenGradesInBackground,
  sweepPendingLlmGrades,
} from "@/lib/llm-grading";

const updateMock = vi.hoisted(() => ({ update: vi.fn() }));
// Results returned by the mocked select queries, in call order per sweep: the
// pending submissions query first, then the written-questions query. `calls`
// is reset before each sweep so the ordering is deterministic per test.
const selectMock = vi.hoisted(() => ({
  calls: 0,
  pending: [] as unknown[],
  questions: [] as unknown[],
}));

vi.mock("@/db/client", () => {
  function chain() {
    const thenable = {
      select: chain,
      from: chain,
      innerJoin: chain,
      where: chain,
      orderBy: chain,
      limit: chain,
      then(resolve: (value: unknown) => unknown) {
        const call = selectMock.calls++;
        return resolve(call === 0 ? selectMock.pending : selectMock.questions);
      },
    };
    return thenable;
  }
  return { db: vi.fn(() => ({ update: updateMock.update, select: chain })) };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function mockUpdateReturning(rows: unknown[]) {
  const returning = vi.fn(async () => rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  updateMock.update.mockReturnValue({ set });
  return { set, where, returning };
}

function mockGemini(ok: boolean, text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 429,
      text: async () => "rate limited",
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    }))
  );
}

describe("suggestWrittenGradesInBackground", () => {
  const questions = [
    { id: "q1", prompt: "Explain X", points: 5 },
    { id: "q2", prompt: "Explain Y", points: 10 },
  ];
  const answers = { q1: "Photosynthesis is...", q2: "Mitosis" };

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    updateMock.update.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores sanitized LLM suggestions on a submitted row", async () => {
    mockGemini(true, '{"q1": 4, "q2": 12, "fake": 9}'); // q2 clamped to 10, fake dropped
    const { set, where } = mockUpdateReturning([{ id: "sub-1" }]);

    await suggestWrittenGradesInBackground("sub-1", questions, answers);

    expect(updateMock.update).toHaveBeenCalledWith(expect.anything());
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ llmGrades: '{"q1":4,"q2":10}' }));
    expect(where).toHaveBeenCalled();
  });

  it("writes nothing when the LLM call fails", async () => {
    mockGemini(false, "");
    const { set } = mockUpdateReturning([{ id: "sub-1" }]);

    await suggestWrittenGradesInBackground("sub-1", questions, answers);

    expect(set).not.toHaveBeenCalled();
  });

  it("never throws when the database update fails", async () => {
    mockGemini(true, '{"q1": 3}');
    updateMock.update.mockImplementation(() => {
      throw new Error("db down");
    });

    await expect(suggestWrittenGradesInBackground("sub-1", questions, answers)).resolves.toBeUndefined();
  });
});

describe("sweepPendingLlmGrades", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    selectMock.calls = 0;
    selectMock.pending = [];
    selectMock.questions = [];
    updateMock.update.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does nothing when there are no pending submissions", async () => {
    const result = await sweepPendingLlmGrades({ limit: 5, concurrency: 2 });
    expect(result).toEqual({ processed: 0 });
    expect(updateMock.update).not.toHaveBeenCalled();
  });

  it("grades a pending submission and stores the suggestions", async () => {
    selectMock.pending = [
      { id: "sub-1", examId: "exam-1", answers: '{"q1":"Photosynthesis is..."}' },
    ];
    selectMock.questions = [{ id: "q1", examId: "exam-1", prompt: "Explain X", points: 5 }];
    mockGemini(true, '{"q1": 4}');
    const { set } = mockUpdateReturning([{ id: "sub-1" }]);

    const result = await sweepPendingLlmGrades({ limit: 5, concurrency: 2 });

    expect(result).toEqual({ processed: 1 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ llmGrades: '{"q1":4}' }));
  });

  it("skips submissions whose exam has no written questions", async () => {
    selectMock.pending = [{ id: "sub-1", examId: "exam-1", answers: "{}" }];
    selectMock.questions = []; // exam-1 has no written questions
    mockGemini(true, '{"q1": 4}');

    const result = await sweepPendingLlmGrades({ limit: 5, concurrency: 2 });

    expect(result).toEqual({ processed: 0 });
    expect(updateMock.update).not.toHaveBeenCalled();
  });

  it("grades multiple submissions in one run", async () => {
    selectMock.pending = [
      { id: "sub-1", examId: "exam-1", answers: '{"q1":"A"}' },
      { id: "sub-2", examId: "exam-1", answers: '{"q1":"B"}' },
    ];
    selectMock.questions = [{ id: "q1", examId: "exam-1", prompt: "Explain X", points: 5 }];
    mockGemini(true, '{"q1": 4}');
    mockUpdateReturning([{ id: "sub-1" }]);

    const result = await sweepPendingLlmGrades({ limit: 5, concurrency: 2 });

    expect(result).toEqual({ processed: 2 });
    expect(updateMock.update).toHaveBeenCalledTimes(2);
  });
});

describe("sanitizeLlmGrades", () => {
  const questions = [
    { id: "q1", prompt: "Explain X", points: 5 },
    { id: "q2", prompt: "Explain Y", points: 10 },
  ];

  it("keeps valid scores within bounds", () => {
    const result = sanitizeLlmGrades({ q1: 4, q2: 7 }, questions);
    expect(result).toEqual({ q1: 4, q2: 7 });
  });

  it("clamps scores above the question's points", () => {
    const result = sanitizeLlmGrades({ q1: 99, q2: 3 }, questions);
    expect(result).toEqual({ q1: 5, q2: 3 });
  });

  it("clamps scores below zero and drops non-integers", () => {
    const result = sanitizeLlmGrades({ q1: -2, q2: 3.7 }, questions);
    expect(result).toEqual({ q1: 0 });
  });

  it("ignores invented question ids", () => {
    const result = sanitizeLlmGrades({ q1: 5, fake: 8 }, questions);
    expect(result).toEqual({ q1: 5 });
  });

  it("returns null for empty input", () => {
    expect(sanitizeLlmGrades(null, questions)).toBeNull();
    expect(sanitizeLlmGrades({}, questions)).toBeNull();
  });
});

describe("parseGradeJson", () => {
  it("extracts a JSON object from wrapped prose", () => {
    const text = 'Here are the grades:\n{"q1": 4, "q2": 8}\nLet me know if you disagree.';
    expect(parseGradeJson(text)).toEqual({ q1: 4, q2: 8 });
  });

  it("accepts a bare JSON object", () => {
    expect(parseGradeJson('{"q1": 5}')).toEqual({ q1: 5 });
  });

  it("returns null for non-JSON text", () => {
    expect(parseGradeJson("I could not grade this exam.")).toBeNull();
  });
});
