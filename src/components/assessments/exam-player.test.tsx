// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamPlayer } from "./exam-player";
import { recordViolation, saveAnswer, submitExam } from "@/lib/actions/exams";
import type { ExamSession } from "@/lib/actions/exams";

vi.mock("@/lib/actions/exams", () => ({
  recordViolation: vi.fn(),
  saveAnswer: vi.fn(),
  submitExam: vi.fn(),
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

describe("ExamPlayer escape anti-cheat", () => {
  it("submits after Escape is pressed more than twice", async () => {
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    pressEscape();
    pressEscape();
    expect(vi.mocked(submitExam)).not.toHaveBeenCalled();

    pressEscape();
    await waitFor(() => expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitExam)).toHaveBeenCalledWith(EXAM_ID);

    // The auto-submission lands the trainee on the result screen.
    await screen.findByText("Your final grade");
  });

  it("does not auto-submit again from the result screen", async () => {
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);
    pressEscape();
    pressEscape();
    pressEscape();
    await waitFor(() => expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1));
    // Let React commit the result screen and flush the finished-guard effect,
    // as would have happened long before a human presses Escape again.
    await act(async () => {});

    // The listeners stay attached while the result screen shows; pressing
    // Escape there must not trigger a second submission.
    pressEscape();
    await act(async () => {});
    expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1);
  });

  it("submits after the trainee stays away from fullscreen for 10 seconds", async () => {
    vi.useFakeTimers();
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    setFullscreen(true); // exam is running in fullscreen
    setFullscreen(false); // Escape kicked them out — the 10s clock starts
    expect(vi.mocked(recordViolation)).toHaveBeenCalledWith(EXAM_ID);

    await act(async () => {
      vi.advanceTimersByTime(9_999);
    });
    expect(vi.mocked(submitExam)).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(vi.mocked(submitExam)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitExam)).toHaveBeenCalledWith(EXAM_ID);
  });

  it("cancels the 10-second clock when the trainee returns to fullscreen", async () => {
    vi.useFakeTimers();
    render(<ExamPlayer session={makeSession()} onDone={vi.fn()} />);

    setFullscreen(true);
    setFullscreen(false); // leave — clock starts
    setFullscreen(true); // click back into the exam — clock cancels

    await act(async () => {
      vi.advanceTimersByTime(20_000);
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
    setFullscreen(false); // leaving fullscreen re-requests it (best effort)
    fireEvent.pointerDown(document); // a click is a user gesture the browser accepts
    await act(async () => {});

    expect(requestFullscreen).toHaveBeenCalled();
  });
});
