"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  MonitorX,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getExamOpenStatus,
  recordViolation,
  saveAnswer,
  submitExam,
  type ExamSession,
} from "@/lib/actions/exams";

const MAX_VIOLATIONS = 3;
const VIOLATION_COOLDOWN_MS = 2000;
// Escape is fully deactivated: it no longer submits or counts against the
// trainee. A submission only happens when the trainee submits themselves, when
// staff close the exam, or when the exam's time runs out. (Browsers still force
// fullscreen off on Escape and scripts can't stop that, but we pull the trainee
// back into fullscreen on the next click instead of penalising them.)
const CLOSE_POLL_MS = 10_000;

function parseSelected(value: string | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed.filter(Number.isInteger) as number[]) : [];
  } catch {
    return [];
  }
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function enterFullscreen() {
  const element = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  request?.call(element).catch(() => {
    /* fullscreen may be unsupported (e.g. iOS) — visibility tracking still works */
  });
}

function exitFullscreen() {
  const doc = document as Document & { exitFullscreen?: () => Promise<void>; webkitExitFullscreen?: () => Promise<void> };
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  exit?.call(doc).catch(() => {});
}

export function ExamPlayer({
  session,
  onDone,
}: {
  session: ExamSession;
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(session.answers);
  const [index, setIndex] = useState(session.currentQuestion);
  const [violations, setViolations] = useState(session.fullscreenViolations);
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(session.endsAt).getTime() - Date.now())
  );
  const [result, setResult] = useState<NonNullable<ExamSession["result"]> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lastViolation = useRef(0);
  const submittingRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const finished =
    session.status === "submitted" || session.status === "graded" || result !== null;

  // The anti-cheat listeners are registered once on mount, so they would
  // otherwise keep reading the first render's `finished` value and could
  // double-submit from the result screen. Keep it in a ref instead.
  const finishedRef = useRef(finished);
  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // After a fresh submission, send the trainee back to the assessments list
  // automatically instead of leaving them on the result screen.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => onDoneRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [result]);

  // Exam-mode lockdown while an attempt is in progress: strip the app chrome
  // and block copy/paste/context-menu so only the exam is interactable.
  useEffect(() => {
    if (finished) return;

    const blockClipboard = (event: ClipboardEvent) => event.preventDefault();
    const blockContext = (event: MouseEvent) => event.preventDefault();
    const blockShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c" || key === "v" || key === "x" || key === "a") {
        event.preventDefault();
      }
    };

    document.body.classList.add("exam-mode");
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockShortcuts);

    return () => {
      document.body.classList.remove("exam-mode");
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockShortcuts);
    };
  }, [finished]);

  async function doSubmit(reason?: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    exitFullscreen();
    const res = await submitExam(session.examId);
    submittingRef.current = false;
    setSubmitting(false);
    if (res.ok && res.result) {
      if (reason) toast.info(reason);
      setResult(res.result);
    } else {
      toast.error(res.error ?? "Could not submit the exam.");
    }
  }

  function handleViolation() {
    if (submittingRef.current || finishedRef.current) return;
    const now = Date.now();
    if (now - lastViolation.current < VIOLATION_COOLDOWN_MS) return;
    lastViolation.current = now;
    void recordViolation(session.examId).then((res) => {
      if (!res.ok || res.violations === undefined) return;
      setViolations(res.violations);
      if (res.violations >= MAX_VIOLATIONS) {
        void doSubmit(
          `Auto-submitted — ${MAX_VIOLATIONS} window switches were detected. Ask a trainer to override if needed.`
        );
      }
    });
  }

  function scheduleSave(nextAnswers: Record<string, string>, nextIndex: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveAnswer(session.examId, nextAnswers, nextIndex).catch(() => {
        /* autosave failures are non-fatal; the next save will retry */
      });
    }, 2000);
  }

  function setAnswer(questionId: string, value: string) {
    if (finished) return;
    const next = { ...answersRef.current, [questionId]: value };
    setAnswers(next);
    scheduleSave(next, index);
  }

  /** Toggles one option of a multiple-answer question (stored as a JSON array). */
  function toggleOption(questionId: string, optionIndex: number) {
    if (finished) return;
    let selected: number[] = [];
    try {
      selected = JSON.parse(answersRef.current[questionId] ?? "[]") as number[];
    } catch {
      selected = [];
    }
    const next = selected.includes(optionIndex)
      ? selected.filter((value) => value !== optionIndex)
      : [...selected, optionIndex];
    const nextAnswers = { ...answersRef.current, [questionId]: JSON.stringify(next) };
    setAnswers(nextAnswers);
    scheduleSave(nextAnswers, index);
  }

  function goNext() {
    if (finished || !currentAnswered) return;
    const nextIndex = Math.min(index + 1, session.questions.length - 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveAnswer(session.examId, answersRef.current, nextIndex).catch(() => {});
    setIndex(nextIndex);
  }

  function goPrev() {
    if (finished) return;
    const prevIndex = Math.max(index - 1, 0);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveAnswer(session.examId, answersRef.current, prevIndex).catch(() => {});
    setIndex(prevIndex);
  }

  // Countdown + fullscreen + anti-cheat listeners.
  useEffect(() => {
    enterFullscreen();

    // A stored session for an already-submitted attempt can be opened again
    // (e.g. "View result"). Never re-run the countdown or auto-submit for it.
    const alreadyFinished = session.status === "submitted" || session.status === "graded";
    if (alreadyFinished) return undefined;

    if (new Date(session.endsAt).getTime() <= Date.now()) {
      const id = setTimeout(() => {
        void doSubmit("Time is up — your exam was submitted automatically.");
      }, 0);
      return () => clearTimeout(id);
    }

    const timer = setInterval(() => {
      if (finishedRef.current) {
        clearInterval(timer);
        return;
      }
      const rem = new Date(session.endsAt).getTime() - Date.now();
      if (rem <= 0) {
        clearInterval(timer);
        void doSubmit("Time is up — your exam was submitted automatically.");
      } else {
        setRemainingMs(rem);
      }
    }, 1000);

    // Poll the exam's open status so a trainee is auto-submitted the moment
    // staff close the exam (or the global close time passes). Lightweight and
    // idempotent — it never double-submits thanks to submittingRef/finishedRef.
    const pollClosed = setInterval(() => {
      if (submittingRef.current || finishedRef.current) return;
      void getExamOpenStatus(session.examId).then(({ open }) => {
        if (!open && !submittingRef.current && !finishedRef.current) {
          void doSubmit("The exam was closed — your answers were submitted automatically.");
        }
      });
    }, CLOSE_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleViolation();
    };
    const onBlur = () => handleViolation();
    // A click while out of fullscreen is a user gesture, so the browser
    // accepts a fullscreen request — Escape no longer submits, but we still
    // pull the trainee back into the lockdown on their next interaction.
    const onPointerDown = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        enterFullscreen();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      clearInterval(timer);
      clearInterval(pollClosed);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("contextmenu", onContextMenu);
      exitFullscreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (finished) {
    const grade = result ?? session.result;
    return (
      <div className="mx-auto max-w-md space-y-6 py-8">
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{session.title}</h2>
          {grade?.graded ? (
            <>
              <p className="text-sm text-muted-foreground">Your final grade</p>
              <p className="text-4xl font-bold tracking-tight">
                {grade.percent !== null ? `${grade.percent}%` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {grade.autoScore + (grade.writtenScore ?? 0)} / {grade.totalPoints} points
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold">Submitted Successfully, Await Grading</p>
              <p className="text-sm text-muted-foreground">
                Your answers have been submitted. The final grade will appear here once your
                trainer finishes grading.
              </p>
            </>
          )}
          <Button className="mt-2" onClick={onDone}>
            Back to exams
          </Button>
        </div>
      </div>
    );
  }

  const question = session.questions[index];
  const isLast = index === session.questions.length - 1;
  const currentAnswered = question
    ? question.type === "objective"
      ? answers[question.id] !== undefined
      : question.type === "multiple"
        ? (() => {
            try {
              return (JSON.parse(answers[question.id] ?? "[]") as number[]).length > 0;
            } catch {
              return false;
            }
          })()
        : (answers[question.id] ?? "").trim() !== ""
    : false;
  const selectedOptions = question?.type === "multiple" ? parseSelected(answers[question.id]) : [];
  const lowTime = remainingMs < 5 * 60_000;

  return (
    <div className="mx-auto max-w-2xl space-y-4 select-none">
      <div className="sticky top-0 z-20 -mx-1 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.title}</p>
            <p className="text-xs text-muted-foreground">
              Question {index + 1} of {session.questions.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {violations > 0 ? (
              <span
                className={`flex items-center gap-1 text-xs font-medium ${
                  violations >= MAX_VIOLATIONS - 1 ? "text-destructive" : "text-gold-foreground"
                }`}
              >
                <MonitorX className="h-4 w-4" />
                {violations}/{MAX_VIOLATIONS} window switches
              </span>
            ) : null}
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                lowTime ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
              }`}
            >
              <Clock3 className="h-4 w-4" />
              {formatClock(remainingMs)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium leading-relaxed">
          {index + 1}. {question?.prompt}
          <span className="ml-1 text-xs text-muted-foreground">({question?.points} pt{question && question.points !== 1 ? "s" : ""})</span>
        </p>

        {question?.options && (question.type === "objective" || question.type === "multiple") ? (
          <div className="mt-4 space-y-2">
            {question.options.map((option, optionIndex) => {
              const selected =
                question.type === "multiple"
                  ? selectedOptions.includes(optionIndex)
                  : answers[question.id] === String(optionIndex);
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() =>
                    question.type === "multiple"
                      ? toggleOption(question.id, optionIndex)
                      : setAnswer(question.id, String(optionIndex))
                  }
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  {option}
                </button>
              );
            })}
            {question.type === "multiple" ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Select all answers that apply.
              </p>
            ) : null}
          </div>
        ) : (
          <Textarea
            className="mt-4 min-h-64"
            placeholder="Type your answer here..."
            value={answers[question?.id ?? ""] ?? ""}
            onChange={(event) => question && setAnswer(question.id, event.target.value)}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          className="gap-1.5"
          disabled={index === 0 || submitting}
          onClick={goPrev}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous question
        </Button>
        {isLast ? (
          <Button
            className="gap-1.5"
            disabled={!currentAnswered || submitting}
            onClick={() => void doSubmit()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Submitting..." : "Submit exam"}
          </Button>
        ) : (
          <Button className="gap-1.5" disabled={!currentAnswered} onClick={goNext}>
            Next question
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
