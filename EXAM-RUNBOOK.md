# Exam-Day Runbook

Assessments → Exams (admin portal). All steps below happen there unless noted.

## Before the exam (~10 minutes)

1. **Confirm the latest build is live** (background grading, DB indexes, grading sweep) — open the app, log in as admin, and click through to `/assessments`.
2. **Verify the exam**: it should exist with its questions and answer keys intact. Open the exam card and use **Preview** to double-check each question's prompt, options and marked answer.
3. **Warm up**: open the dashboard a few minutes before start time. This wakes a cold database/serverless function so the first trainee logins don't pay a cold-start delay.

## Opening the exam

1. **Create exam** (if not done) — New exam → title, course, duration, description. It starts as a **draft**.
2. **Add questions** — one by one with **Add question**, or **Upload questions** (CSV, Excel, PDF, Word, Markdown, HTML). After an upload you get a review step: search, filter, edit, remove rows, then import.
3. **Open** — click **Open** on the exam card and pick a closing time (must be ≥ 1 minute away). Trainees are notified (in-app, plus email if they have one) and the exam appears as **Start exam** on their Assessments page.
4. Once open, questions are locked — no more edits.

## During the exam (monitoring)

- **Trainees (N)** button on the card — who has started (in progress) vs. submitted.
- **Results (N)** button expands the card with per-attempt details: status, auto score, % badge, and any window-switch count.
- Anti-cheat: exams run full-screen. Pressing Escape more than twice (3rd press), or leaving full-screen for more than 10 seconds, auto-submits the attempt. Time-up also auto-submits. Trainees can stay idle on the exam screen as long as they like — only Escape/leaving triggers the clock.
- Auto-submitted attempts show as **Submitted**; the trainee sees the reason.
- Re-opening a **finished** attempt (e.g. **View result**) is read-only: the countdown and anti-cheat listeners don't run again, so it never re-submits or shows a "Time is up" toast.

## Reopen flow (a trainee)

Use when an attempt ended early (e.g. auto-submitted) but the trainee should continue — **only while the exam is still open**.

1. Exam card → **Trainees** dialog.
2. **Reopen** next to the trainee → confirm **Reopen exam** (toast: "Override granted").
3. The trainee's button becomes **Resume** — they continue where they left off with their answers kept; the countdown restarts. (Re-opening a finished attempt via **View result** is read-only — no countdown, no re-submit.)

To reopen the whole exam for everyone (after closing it by mistake), use the card's **Reopen** button — trainees are notified again.

## Grading & closing

1. **Grade written answers** — in the expanded **Results**, click **Grade written** next to a submitted attempt that has written questions. AI-suggested scores are pre-filled (generated in the background after submit); review each and adjust. Every written question needs a score between 0 and its points. **Save grades** → status becomes **Graded** and the trainee sees their final percentage.
2. Objective/multiple questions are auto-graded at submit — no action needed.
3. **Close** the exam (button on the card) when done — trainees can no longer start or submit.
4. Closed by mistake? **Reopen** on the card restores it.

## Quick facts

| Thing | Value |
|---|---|
| Exam duration | 1–240 minutes (set at creation) |
| Closing time | must be ≥ 1 minute in the future |
| Auto-submit triggers | Escape ≥ 3×, out of full-screen > 10s, time up |
| Window-switch limit | 3 switches (blur / tab switch / leaving full-screen) auto-submit |
| Re-open a finished attempt (View result) | read-only — no countdown, no re-submit |
| Reopen a trainee's attempt (to resume) | only while the exam is open |
| Written grading | required before the attempt shows a final grade |
