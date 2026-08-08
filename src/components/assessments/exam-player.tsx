"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  MonitorX,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordViolation, saveAnswer, submitExam, type ExamSession } from "@/lib/actions/exams";

const MAX_VIOLATIONS = 3;
const VIOLATION_COOLDOWN_MS = 2000;

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

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const finished =
    session.status === "submitted" || session.status === "graded" || result !== null;

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
    if (submittingRef.current || finished) return;
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
    }, 600);
  }

  function setAnswer(questionId: string, value: string) {
    if (finished) return;
    const next = { ...answersRef.current, [questionId]: value };
    setAnswers(next);
    scheduleSave(next, index);
  }

  function goNext() {
    if (finished || !currentAnswered) return;
    const nextIndex = Math.min(index + 1, session.questions.length - 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveAnswer(session.examId, answersRef.current, nextIndex).catch(() => {});
    setIndex(nextIndex);
  }

  // Countdown + fullscreen + anti-cheat listeners.
  useEffect(() => {
    enterFullscreen();

    if (new Date(session.endsAt).getTime() <= Date.now()) {
      const id = setTimeout(() => {
        void doSubmit("Time is up — your exam was submitted automatically.");
      }, 0);
      return () => clearTimeout(id);
    }

    const timer = setInterval(() => {
      const rem = new Date(session.endsAt).getTime() - Date.now();
      if (rem <= 0) {
        clearInterval(timer);
        void doSubmit("Time is up — your exam was submitted automatically.");
      } else {
        setRemainingMs(rem);
      }
    }, 1000);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleViolation();
    };
    const onBlur = () => handleViolation();
    const onFullscreen = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        handleViolation();
        enterFullscreen();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);

    return () => {
      clearInterval(timer);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
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
            {grade && (grade.percent ?? 0) >= 50 ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : (
              <AlertTriangle className="h-7 w-7" />
            )}
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{session.title}</h2>
          <p className="text-sm text-muted-foreground">
            {grade?.graded ? "Final grade (including written answers)" : "Your submitted score"}
          </p>
          {grade ? (
            <>
              <p className="text-4xl font-bold tracking-tight">
                {grade.percent !== null ? `${grade.percent}%` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {grade.autoScore + (grade.writtenScore ?? 0)} / {grade.totalPoints} points
              </p>
              {!grade.graded ? (
                <p className="text-xs text-muted-foreground">
                  Written questions are graded by your trainer. Your final grade will appear here
                  once marked.
                </p>
              ) : null}
            </>
          ) : null}
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
      : (answers[question.id] ?? "").trim() !== ""
    : false;
  const lowTime = remainingMs < 5 * 60_000;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="sticky top-14 z-20 -mx-1 rounded-xl border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
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

        {question?.type === "objective" && question.options ? (
          <div className="mt-4 space-y-2">
            {question.options.map((option, optionIndex) => {
              const selected = answers[question.id] === String(optionIndex);
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() => setAnswer(question.id, String(optionIndex))}
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
          </div>
        ) : (
          <Textarea
            className="mt-4 min-h-32"
            placeholder="Type your answer here..."
            value={answers[question?.id ?? ""] ?? ""}
            onChange={(event) => question && setAnswer(question.id, event.target.value)}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          You cannot go back to previous questions.
        </p>
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
