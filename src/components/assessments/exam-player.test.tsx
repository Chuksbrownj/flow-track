// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamPlayer } from "./exam-player";
import { getExamOpenStatus, recordViolation, saveAnswer, submitExam } from "@/lib/actions/exams";
import type { ExamSession } from "@/lib/actions/exams";

vi.mock("@/lib/actions/exams", () => ({
  recordViolation: vi.fn(),
  saveAnswer: vi.fn(),
  submitExam: vi.fn(),
  getExamOpenStatus: vi.fn(),
}));

const EXAM_ID = "exam-1";

function makeSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    examId: EXAM_ID,
    title: "Graphic Design — Module 1",
    description: null,
    durationMinutes: 30,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    questions: [
      {
        id: "q1",
        type: "objective",
        prompt: "What color is the sky?",
        options: ["Blue", "Red"],
        points: 1,
      },
    ],
    answers: {},
    currentQuestion: 0,
    fullscreenViolations: 0,
    status: "in_progress",
    ...overrides,
  };
}

const gradedResult = {
  ok: true,
  result: {
    autoScore: 1,
    totalPoints: 1,
    writtenScore: null,
    percent: 100,
    graded: true,
  },
};

beforeEach(() => {
  vi.mocked(submitExam).mockResolvedValue(gradedResult);
  vi.mocked(recordViolation).mockResolvedValue({ ok: true, violations: 1 });
  vi.mocked(saveAnswer).mockResolvedValue({ ok: true });
  vi.mocked(getExamOpenStatus).mockResolvedValue({ open: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function pressEscape() {
  fireEvent.keyDown(document, { key: "Escape" });
}

/**
 * jsdom has no real fullscreen API, so flip our own flag and fire the event
 * the same way a browser would after the user presses Escape or clicks back.
 */
function setFullscreen(on: boolean) {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  Object.defineProperty(doc, "webkitFullscreenElement", {
    configurable: true,
    value: on ? document.documentElement : null,
  });
  document.dispatchEvent(new Event("fullscreenchange"));
}

describe("ExamPlayer Escape behaviour", () => {
  it("does not auto-submit when Escape is pressed", async () => {
    vi.useFakeTimers();
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    for (let i = 0; i < 10; i += 1) pressEscape();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(vi.mocked(submitExam)).not.toHaveBeenCalled();
  });

  it("tries to pull the trainee back into fullscreen on a click", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const element = document.documentElement as HTMLElement & {
      requestFullscreen: () => Promise<void>;
    };
    element.requestFullscreen = requestFullscreen;
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    setFullscreen(true);
    setFullscreen(false); // Escape left full-screen
    fireEvent.pointerDown(document); // a click is a user gesture the browser accepts
    await act(async () => {});

    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("re-enters fullscreen automatically when Escape exits it", async () => {
    vi.useFakeTimers();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const element = document.documentElement as HTMLElement & {
      requestFullscreen: () => Promise<void>;
    };
    element.requestFullscreen = requestFullscreen;
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);
    requestFullscreen.mockClear(); // ignore the initial mount request

    setFullscreen(true);
    setFullscreen(false); // Escape forced fullscreen off

    // The fullscreenchange handler immediately tries to pull the trainee back in.
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("keeps retrying fullscreen re-entry after Escape", async () => {
    vi.useFakeTimers();
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("cooldown"));
    const element = document.documentElement as HTMLElement & {
      requestFullscreen: () => Promise<void>;
    };
    element.requestFullscreen = requestFullscreen;
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);
    requestFullscreen.mockClear();

    setFullscreen(true);
    setFullscreen(false); // Escape forced fullscreen off
    const afterFirst = requestFullscreen.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(requestFullscreen.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});

describe("ExamPlayer auto-submit", () => {
  it("submits when the exam is closed by staff", async () => {
    vi.useFakeTimers();
    vi.mocked(getExamOpenStatus).mockResolvedValue({ open: false });
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitExam)).toHaveBeenCalledWith(EXAM_ID);
  });

  it("submits when the exam time runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    render(
      <ExamPlayer
        session={makeSession({ endsAt: new Date(Date.now() + 5_000).toISOString() })}
        onDone={vi.fn()}
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });

    expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitExam)).toHaveBeenCalledWith(EXAM_ID);
  });
});

describe("ExamPlayer navigation", () => {
  it("lets a trainee go back to a previous question", () => {
    const session = makeSession({
      questions: [
        { id: "q1", type: "objective", prompt: "First question?", options: ["A", "B"], points: 1 },
        { id: "q2", type: "objective", prompt: "Second question?", options: ["A", "B"], points: 1 },
      ],
      currentQuestion: 1,
    });
    render(<ExamPlayer session={session} onDone={vi.fn()} />);

    expect(screen.getByText(/Second question/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Previous question/ }));

    expect(screen.getByText(/First question/)).toBeTruthy();
    expect(vi.mocked(saveAnswer)).toHaveBeenCalledWith(EXAM_ID, expect.any(Object), 0);
  });

  it("disables Previous on the first question", () => {
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    const previous = screen.getByRole("button", {
      name: /Previous question/,
    }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
  });
});

describe("ExamPlayer inactivity", () => {
  it("does not auto-submit just because the trainee stays on the screen", async () => {
    vi.useFakeTimers();
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    // Well past the 10-second full-screen window, with no Escape / full-screen exit.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(vi.mocked(submitExam)).not.toHaveBeenCalled();
  });
});

describe("ExamPlayer finished attempts", () => {
  it("does not re-submit or toast 'Time is up' when a finished attempt is re-opened", async () => {
    vi.useFakeTimers();
    const session = makeSession({
      status: "submitted",
      // The countdown is long past — the old bug re-submitted instantly here.
      endsAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    });
    render(<ExamPlayer session={session} onDone={vi.fn()} />);

    // The finished screen is shown, not the in-progress exam.
    expect(screen.getByText(/Submitted Successfully/)).toBeTruthy();
    expect(screen.queryByText(/Time is up/)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(vi.mocked(submitExam)).not.toHaveBeenCalled();
    expect(screen.queryByText(/Time is up/)).toBeNull();
  });
});
