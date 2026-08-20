"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileUp,
  GraduationCap,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addExamQuestion,
  closeExam,
  createExam,
  deleteExam,
  deleteExamQuestion,
  gradeWritten,
  importQuestions,
  openExam,
  overrideSubmission,
  previewQuestionFile,
  reopenExam,
  updateExamDetails,
  updateExamQuestion,
} from "@/lib/actions/exams";
import { questionTemplateCsv } from "@/lib/question-template";
import type { ImportedQuestion } from "@/lib/assessment-import";

export type SubmissionRow = {
  id: string;
  traineeName: string;
  registrationNumber: string | null;
  status: string;
  autoScore: number | null;
  writtenScore: number | null;
  totalPoints: number;
  fullscreenViolations: number;
  submittedAt: string | null;
  writtenQuestions: { id: string; prompt: string; points: number; answer: string }[];
  /** {questionId: score} suggested by the LLM, for the review queue. */
  llmGrades: Record<string, number> | null;
};

export type QuestionRow = {
  id: string;
  type: "objective" | "multiple" | "written";
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  correctOptions: number[] | null;
  points: number;
};

export type ExamListItem = {
  id: string;
  title: string;
  topic: string;
  description: string | null;
  durationMinutes: number;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  createdBy: string | null;
  questionCount: number;
  questions: QuestionRow[];
  submissions: SubmissionRow[];
};

function percent(autoScore: number | null, writtenScore: number | null, totalPoints: number) {
  if (totalPoints <= 0) return null;
  const score = (autoScore ?? 0) + (writtenScore ?? 0);
  return Math.round((score / totalPoints) * 100);
}

function downloadTemplate() {
  const blob = new Blob([questionTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "assessment-questions-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExamsClient({
  exams,
  canCreateAnyTopic,
  trainerTopic,
  courses,
}: {
  exams: ExamListItem[];
  canCreateAnyTopic: boolean;
  trainerTopic: string | null;
  /** Active course names (dynamic) used for the exam topic select. */
  courses: string[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<ExamListItem | null>(null);
  const [editTarget, setEditTarget] = useState<ExamListItem | null>(null);
  const [gradeTarget, setGradeTarget] = useState<{ submission: SubmissionRow; exam: ExamListItem } | null>(null);
  const [addQuestionTarget, setAddQuestionTarget] = useState<ExamListItem | null>(null);
  const [editQuestionTarget, setEditQuestionTarget] = useState<{
    exam: ExamListItem;
    question: QuestionRow;
  } | null>(null);
  const [confirmEditTarget, setConfirmEditTarget] = useState<{
    exam: ExamListItem;
    question: QuestionRow;
  } | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<{
    exam: ExamListItem;
    question: QuestionRow;
  } | null>(null);
  const [closeTarget, setCloseTarget] = useState<ExamListItem | null>(null);
  const [reopenTarget, setReopenTarget] = useState<ExamListItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    exam: ExamListItem;
    fileName: string;
    questions: ImportedQuestion[];
  } | null>(null);
  const [previewSavedTarget, setPreviewSavedTarget] = useState<ExamListItem | null>(null);
  const [traineesTarget, setTraineesTarget] = useState<ExamListItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(id: string, action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setPendingId(null);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  /** Parses an uploaded file and opens the review dialog — nothing saved yet. */
  function previewForExam(exam: ExamListItem, file: File) {
    const formData = new FormData();
    formData.set("file", file);
    setPendingId(exam.id);
    startTransition(async () => {
      const result = await previewQuestionFile(formData);
      setPendingId(null);
      if (result.ok && result.questions) {
        setPreviewTarget({ exam, fileName: file.name, questions: result.questions });
      } else {
        toast.error(result.error ?? "Could not read the file.");
      }
    });
  }

  /** Saves the reviewed questions into the exam. */
  function confirmImport(exam: ExamListItem, questions: ImportedQuestion[]) {
    setPendingId(exam.id);
    startTransition(async () => {
      const result = await importQuestions(exam.id, questions);
      setPendingId(null);
      if (result.ok) {
        setPreviewTarget(null);
        toast.success(result.message ?? `Imported ${questions.length} questions.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const busy = pendingId !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Exams</h2>
          <p className="text-sm text-muted-foreground">
            Create exams, import questions from CSV, Excel, PDF, Word, Markdown
            or HTML, and open them for trainees.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" />
              New exam
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <CreateExamForm
              canCreateAnyTopic={canCreateAnyTopic}
              trainerTopic={trainerTopic}
              courses={courses}
              onSubmit={(formData) => {
                setPendingId("new");
                startTransition(async () => {
                  const result = await createExam(formData);
                  setPendingId(null);
                  if (result.ok) {
                    setCreateOpen(false);
                    toast.success("Exam created. Add questions to get started.");
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Something went wrong.");
                  }
                });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <GraduationCap className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">No exams yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Create your first exam, then add questions one by one or upload them from a
              CSV, Excel, PDF, Word, Markdown or HTML file.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => {
            const expanded = expandedId === exam.id;
            return (
              <Card key={exam.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        {exam.title}
                        <StatusBadge status={exam.status} />
                        <Badge variant="secondary">{exam.topic}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {exam.durationMinutes} min
                        </span>
                        <span>{exam.questionCount} question{exam.questionCount === 1 ? "" : "s"}</span>
                        {exam.createdBy ? <span>by {exam.createdBy}</span> : null}
                        {exam.closesAt ? (
                          <span>closes {new Date(exam.closesAt).toLocaleString("en-GB")}</span>
                        ) : null}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <UploadQuestionsButton
                        busy={busy}
                        onFile={(file) => previewForExam(exam, file)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setAddQuestionTarget(exam)}
                      >
                        <Plus className="h-4 w-4" />
                        Add question
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={exam.questionCount === 0}
                        title="Preview the questions saved in this exam"
                        onClick={() => setPreviewSavedTarget(exam)}
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                      {exam.status === "draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={exam.questionCount === 0}
                          onClick={() => setOpenTarget(exam)}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Open
                        </Button>
                      ) : exam.status === "open" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive"
                          onClick={() => setCloseTarget(exam)}
                        >
                          <XCircle className="h-4 w-4" />
                          Close
                        </Button>
                      ) : exam.status === "closed" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-primary"
                          onClick={() => setReopenTarget(exam)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reopen
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setEditTarget(exam)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        title="See who is taking this exam"
                        onClick={() => setTraineesTarget(exam)}
                      >
                        <Users className="h-4 w-4" />
                        Trainees ({exam.submissions.filter((s) => s.status === "in_progress").length})
                      </Button>
                      <Button
                        variant={expanded ? "secondary" : "ghost"}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setExpandedId(expanded ? null : exam.id)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Results ({exam.submissions.length})
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-destructive"
                            title="Delete exam"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete exam?</AlertDialogTitle>
                            <AlertDialogDescription>
                              &quot;{exam.title}&quot; will be removed from the list. Its questions are hidden
                              from future use, but {exam.submissions.length > 0
                                ? "its submissions and grades stay intact for reporting"
                                : "any submissions and grades stay intact for reporting"}. This cannot
                              be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => run(exam.id, () => deleteExam(exam.id))}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                {expanded ? (
                  <CardContent className="space-y-5">
                    {exam.questions.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Questions ({exam.questions.length})
                        </p>
                        <ul className="divide-y rounded-lg border">
                          {exam.questions.map((question, qIndex) => (
                            <li
                              key={question.id}
                              className="flex items-start justify-between gap-3 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm">
                                  <span className="text-muted-foreground">{qIndex + 1}.</span>{" "}
                                  {question.prompt}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {question.type === "written"
                                    ? "Written"
                                    : question.type === "multiple"
                                      ? "Multiple answer"
                                      : "Objective"}
                                  {" · "}
                                  {question.points} pt{question.points === 1 ? "" : "s"}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  title="Edit question"
                                  onClick={() =>
                                    exam.submissions.length > 0
                                      ? setConfirmEditTarget({ exam, question })
                                      : setEditQuestionTarget({ exam, question })
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-destructive"
                                  title="Delete question"
                                  onClick={() => setDeleteQuestionTarget({ exam, question })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Submissions ({exam.submissions.length})
                      </p>
                    {exam.submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No submissions yet.</p>
                    ) : (
                      <ul className="divide-y">
                        {exam.submissions.map((submission) => {
                          const hasWritten = submission.writtenQuestions.length > 0;
                          const canGrade = submission.status === "submitted" && hasWritten;
                          const canOverride = submission.status === "submitted" && exam.status === "open";
                          const pct = percent(submission.autoScore, submission.writtenScore, submission.totalPoints);
                          return (
                            <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{submission.traineeName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {submission.registrationNumber ?? "—"} · submitted{" "}
                                  {submission.submittedAt
                                    ? new Date(submission.submittedAt).toLocaleString("en-GB")
                                    : "—"}
                                  {submission.fullscreenViolations > 0
                                    ? ` · ${submission.fullscreenViolations} window switch${submission.fullscreenViolations === 1 ? "" : "es"}`
                                    : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={submission.status} />
                                {pct !== null ? (
                                  <Badge variant={pct >= 50 ? "default" : "destructive"}>{pct}%</Badge>
                                ) : null}
                                {canGrade ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5"
                                    onClick={() => setGradeTarget({ submission, exam })}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Grade written
                                  </Button>
                                ) : null}
                                {canOverride ? (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-primary"
                                        title="Reopen the exam for this trainee"
                                      >
                                        <KeyRound className="h-4 w-4" />
                                        Reopen
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Reopen this exam for the trainee?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          The trainee will continue from where they left off, with their answers
                                          intact and the window-switch counter reset. This is only allowed while
                                          the exam is still open.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => run(submission.id, () => overrideSubmission(submission.id))}>
                                          Reopen exam
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={openTarget !== null} onOpenChange={(open) => !open && setOpenTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {openTarget ? (
            <OpenExamForm
              exam={openTarget}
              onSubmit={(closesAt) =>
                run(openTarget.id, () => openExam(openTarget.id, closesAt))
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {editTarget ? (
            <EditExamForm
              key={editTarget.id}
              exam={editTarget}
              onSubmit={(formData) =>
                run(editTarget.id, () => updateExamDetails(editTarget.id, formData))
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={gradeTarget !== null} onOpenChange={(open) => !open && setGradeTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          {gradeTarget ? (
            <GradeWrittenForm
              key={gradeTarget.submission.id}
              exam={gradeTarget.exam}
              submission={gradeTarget.submission}
              onSubmit={(grades) =>
                run(gradeTarget.submission.id, () => gradeWritten(gradeTarget.submission.id, grades))
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewSavedTarget !== null} onOpenChange={(open) => !open && setPreviewSavedTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          {previewSavedTarget ? (
            <SavedQuestionsPreviewDialog
              key={previewSavedTarget.id}
              exam={previewSavedTarget}
              onClose={() => setPreviewSavedTarget(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={traineesTarget !== null} onOpenChange={(open) => !open && setTraineesTarget(null)}>
        <DialogContent className="sm:max-w-xl">
          {traineesTarget ? (
            <TraineesTakingExamDialog
              key={traineesTarget.id}
              exam={traineesTarget}
              onGrade={(submission) => setGradeTarget({ submission, exam: traineesTarget })}
              onReopen={(submission) => run(submission.id, () => overrideSubmission(submission.id))}
              onClose={() => setTraineesTarget(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={previewTarget !== null} onOpenChange={(open) => !open && setPreviewTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          {previewTarget ? (
            <PreviewQuestionsDialog
              key={`${previewTarget.exam.id}-${previewTarget.fileName}`}
              exam={previewTarget.exam}
              fileName={previewTarget.fileName}
              questions={previewTarget.questions}
              busy={busy}
              onRemove={(index) =>
                setPreviewTarget((prev) =>
                  prev
                    ? { ...prev, questions: prev.questions.filter((_, i) => i !== index) }
                    : prev
                )
              }
              onEdit={(index, question) =>
                setPreviewTarget((prev) =>
                  prev
                    ? {
                        ...prev,
                        questions: prev.questions.map((q, i) => (i === index ? question : q)),
                      }
                    : prev
                )
              }
              onClose={() => setPreviewTarget(null)}
              onImport={(questions) => confirmImport(previewTarget.exam, questions)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={addQuestionTarget !== null}
        onOpenChange={(open) => !open && setAddQuestionTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          {addQuestionTarget ? (
            <QuestionForm
              key={addQuestionTarget.id}
              exam={addQuestionTarget}
              initial={null}
              onSubmit={(formData) => {
                setPendingId(addQuestionTarget.id);
                startTransition(async () => {
                  const result = await addExamQuestion(addQuestionTarget.id, formData);
                  setPendingId(null);
                  if (result.ok) {
                    toast.success(result.message ?? "Question added.");
                    // FEAT-01: close the dialog so the trainer can immediately add another.
                    setAddQuestionTarget(null);
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Something went wrong.");
                  }
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editQuestionTarget !== null}
        onOpenChange={(open) => !open && setEditQuestionTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          {editQuestionTarget ? (
            <QuestionForm
              key={editQuestionTarget.question.id}
              exam={editQuestionTarget.exam}
              initial={editQuestionTarget.question}
              onSubmit={(formData) => {
                const { exam, question } = editQuestionTarget;
                setPendingId(question.id);
                startTransition(async () => {
                  const result = await updateExamQuestion(exam.id, question.id, formData);
                  setPendingId(null);
                  if (result.ok) {
                    toast.success(result.message ?? "Question updated.");
                    setEditQuestionTarget(null);
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Something went wrong.");
                  }
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmEditTarget !== null}
        onOpenChange={(open) => !open && setConfirmEditTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This exam already has {confirmEditTarget?.exam.submissions.length ?? 0}{" "}
              submission{confirmEditTarget?.exam.submissions.length === 1 ? "" : "s"}. Editing
              the question won&apos;t change grades already recorded — only new attempts will use
              the updated version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmEditTarget) return;
                const target = confirmEditTarget;
                setConfirmEditTarget(null);
                setEditQuestionTarget(target);
              }}
            >
              Continue editing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteQuestionTarget !== null}
        onOpenChange={(open) => !open && setDeleteQuestionTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteQuestionTarget?.question.prompt.slice(0, 80)}…&quot; will be removed from the
              exam. Grades already recorded for this question stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteQuestionTarget) return;
                const { exam, question } = deleteQuestionTarget;
                setDeleteQuestionTarget(null);
                run(exam.id, () => deleteExamQuestion(exam.id, question.id));
              }}
            >
              Delete question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closeTarget !== null} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{closeTarget?.title}&quot; will be closed. Trainees can no longer start or submit
              it. You can reopen it later if this was a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => closeTarget && run(closeTarget.id, () => closeExam(closeTarget.id))}
            >
              <XCircle className="h-4 w-4" />
              Close exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenTarget !== null} onOpenChange={(open) => !open && setReopenTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{reopenTarget?.title}&quot; will be reopened so trainees can continue or retake it.
              The window restarts from now (24 hours if the original closing time already passed).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!reopenTarget) return;
                const id = reopenTarget.id;
                setReopenTarget(null);
                run(id, () => reopenExam(id));
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reopen exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateExamForm({
  canCreateAnyTopic,
  trainerTopic,
  courses,
  onSubmit,
}: {
  canCreateAnyTopic: boolean;
  trainerTopic: string | null;
  courses: string[];
  onSubmit: (formData: FormData) => void;
}) {
  const [topic, setTopic] = useState<string>(trainerTopic ?? courses[0] ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          New exam
        </DialogTitle>
        <DialogDescription>
          Create a draft, then add questions manually or upload them from a CSV, Excel,
          PDF, Word, Markdown or HTML file.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="exam-title">Title</Label>
        <Input id="exam-title" name="title" required minLength={3} placeholder="e.g. Graphic Design — Module 1" />
      </div>
      {canCreateAnyTopic ? (
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courses.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="topic" value={topic} />
        </div>
      ) : (
        <input type="hidden" name="topic" value={trainerTopic ?? ""} />
      )}
      <div className="space-y-2">
        <Label htmlFor="exam-duration">Duration (minutes)</Label>
        <Input id="exam-duration" name="durationMinutes" type="number" min={1} max={240} required defaultValue={30} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="exam-description">Description (optional)</Label>
        <Textarea id="exam-description" name="description" rows={2} placeholder="Instructions or notes for trainees" />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit">
          <Plus className="h-4 w-4" />
          Create exam
        </Button>
      </DialogFooter>
    </form>
  );
}

function UploadQuestionsButton({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();

  function handleFile(file: File | undefined) {
    if (!file) return;
    startUpload(() => onFile(file));
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => inputRef.current?.click()}
        disabled={busy || uploading}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        Upload questions
      </Button>        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.docx,.doc,.pdf,.md,.txt,.html,.htm"
          className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={downloadTemplate}>
        <Download className="h-4 w-4" />
        Template
      </Button>
    </div>
  );
}

/** Returns true when the given option index is part of the question's answer key. */
function isCorrectOption(
  question: Pick<ImportedQuestion, "type" | "correctOption" | "correctOptions">,
  optionIndex: number
): boolean {
  if (question.type === "objective") return question.correctOption === optionIndex;
  if (question.type === "multiple") return question.correctOptions?.includes(optionIndex) ?? false;
  return false;
}

/**
 * Read-only preview of the questions currently saved in an exam, with their
 * answer keys. Always available from the exam card — no file re-upload needed.
 */
function SavedQuestionsPreviewDialog({
  exam,
  onClose,
}: {
  exam: ExamListItem;
  onClose: () => void;
}) {
  const questions = exam.questions;
  const typeLabel = (type: QuestionRow["type"]) =>
    type === "written" ? "Written" : type === "multiple" ? "Multiple answer" : "Objective";

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Preview questions
        </DialogTitle>
        <DialogDescription>
          &quot;{exam.title}&quot; — {questions.length} question{questions.length === 1 ? "" : "s"} saved.
          The marked options are the answer key used for auto-grading.
        </DialogDescription>
      </DialogHeader>
      {questions.length === 0 ? (
        <p className="rounded-lg border bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
          No questions saved yet.
        </p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {questions.map((question, index) => (
            <li key={question.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {index + 1}. {question.prompt}
                </span>
                <Badge variant="secondary">{typeLabel(question.type)}</Badge>
                <span className="text-xs text-muted-foreground">
                  {question.points} pt{question.points === 1 ? "" : "s"}
                </span>
              </div>
              {question.options ? (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {question.options.map((option, optionIndex) => (
                    <li key={optionIndex}>
                      {String.fromCharCode(65 + optionIndex)}. {option}
                      {isCorrectOption(question, optionIndex) ? " ✓ correct" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Theory answer — graded manually.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <DialogFooter showCloseButton={false}>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Lists every trainee attempt for an exam in a dialog, so trainers can see who
 * is taking the exam and reopen auto-submitted attempts without expanding the
 * results section.
 */
function TraineesTakingExamDialog({
  exam,
  onGrade,
  onReopen,
  onClose,
}: {
  exam: ExamListItem;
  onGrade: (submission: SubmissionRow) => void;
  onReopen: (submission: SubmissionRow) => void;
  onClose: () => void;
}) {
  const activeCount = exam.submissions.filter((s) => s.status === "in_progress").length;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Trainees taking this exam
        </DialogTitle>
        <DialogDescription>
          &quot;{exam.title}&quot; — {exam.submissions.length} attempt
          {exam.submissions.length === 1 ? "" : "s"}
          {activeCount > 0 ? `, ${activeCount} in progress` : ""}. You can reopen a
          submitted attempt while the exam is still open.
        </DialogDescription>
      </DialogHeader>
      {exam.submissions.length === 0 ? (
        <p className="rounded-lg border bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
          No trainees have started this exam yet.
        </p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {exam.submissions.map((submission) => {
            const hasWritten = submission.writtenQuestions.length > 0;
            const canGrade = submission.status === "submitted" && hasWritten;
            const canOverride = submission.status === "submitted" && exam.status === "open";
            const pct = percent(submission.autoScore, submission.writtenScore, submission.totalPoints);
            return (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{submission.traineeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {submission.registrationNumber ?? "—"}
                    {submission.submittedAt
                      ? ` · submitted ${new Date(submission.submittedAt).toLocaleString("en-GB")}`
                      : ""}
                    {submission.fullscreenViolations > 0
                      ? ` · ${submission.fullscreenViolations} window switch${submission.fullscreenViolations === 1 ? "" : "es"}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={submission.status} />
                  {pct !== null ? (
                    <Badge variant={pct >= 50 ? "default" : "destructive"}>{pct}%</Badge>
                  ) : null}
                  {canGrade ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => onGrade(submission)}
                    >
                      <Pencil className="h-4 w-4" />
                      Grade written
                    </Button>
                  ) : null}
                  {canOverride ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-primary"
                          title="Reopen the exam for this trainee"
                        >
                          <KeyRound className="h-4 w-4" />
                          Reopen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reopen this exam for the trainee?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The trainee will continue from where they left off, with their answers
                            intact and the window-switch counter reset. This is only allowed while
                            the exam is still open.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onReopen(submission)}>
                            Reopen exam
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <DialogFooter showCloseButton={false}>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * The review step shown after a question file is parsed: the admin sees every
 * question with its answer key, can search and filter, edit or drop misread
 * rows (individually or in bulk), then imports the remaining questions.
 */
function PreviewQuestionsDialog({
  exam,
  fileName,
  questions,
  busy,
  onRemove,
  onEdit,
  onClose,
  onImport,
}: {
  exam: ExamListItem;
  fileName: string;
  questions: ImportedQuestion[];
  busy: boolean;
  onRemove: (index: number) => void;
  onEdit: (index: number, question: ImportedQuestion) => void;
  onClose: () => void;
  onImport: (questions: ImportedQuestion[]) => void;
}) {
  // Only one row can be edited at a time; the other rows are locked so the
  // index that identifies the row being edited can't shift under it.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ImportedQuestion["type"]>("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const editing = editingIndex !== null;

  // Entries keep their position in the full list, so numbering, editing and
  // removal always target the right question even while the list is filtered.
  // Changing the search/type filter closes the open inline editor so a
  // filtered-out row can never leave the dialog stuck in edit mode.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        if (typeFilter !== "all" && question.type !== typeFilter) return false;
        if (q === "") return true;
        const haystack = [question.prompt, ...(question.options ?? [])].join(" ").toLowerCase();
        return haystack.includes(q);
      });
  }, [questions, query, typeFilter]);

  const selectedCount = selected.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((entry) => selected.has(entry.index));

  function toggleSelected(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.every((entry) => next.has(entry.index))) {
        filtered.forEach((entry) => next.delete(entry.index));
      } else {
        filtered.forEach((entry) => next.add(entry.index));
      }
      return next;
    });
  }

  function removeSelected() {
    if (selected.size === 0) return;
    // Remove in descending index order so earlier indexes stay valid as the
    // list shrinks (the parent filters by index on each removal).
    [...selected].sort((a, b) => b - a).forEach((index) => onRemove(index));
    setSelected(new Set());
    setEditingIndex(null);
  }

  const typeLabel = (type: ImportedQuestion["type"]) =>
    type === "written" ? "Written" : type === "multiple" ? "Multiple answer" : "Objective";
  const pointsLabel = (points: number) => `${points} pt${points === 1 ? "" : "s"}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onImport(questions);
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-primary" />
          Review imported questions
        </DialogTitle>
        <DialogDescription>
          {fileName} — {questions.length} question{questions.length === 1 ? "" : "s"} parsed from
          &quot;{exam.title}&quot;. Edit or remove any that were misread, then import the rest.
        </DialogDescription>
      </DialogHeader>

      {questions.length === 0 ? (
        <p className="rounded-lg border bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
          No questions left to import.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setEditingIndex(null);
                }}
                placeholder="Search questions..."
                className="pl-8"
                aria-label="Search questions"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value as "all" | ImportedQuestion["type"]);
                setEditingIndex(null);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="objective">Objective</SelectItem>
                <SelectItem value="multiple">Multiple answer</SelectItem>
                <SelectItem value="written">Written</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={filtered.length === 0}
              onClick={toggleSelectAll}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {allFilteredSelected ? "Clear selection" : "Select all"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive"
              disabled={selectedCount === 0 || editing}
              onClick={removeSelected}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove selected ({selectedCount})
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {questions.length} question
            {questions.length === 1 ? "" : "s"}
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
          </p>

          {filtered.length === 0 ? (
            <p className="rounded-lg border bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
              No questions match your search.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filtered.map(({ question, index }) =>
                index === editingIndex ? (
                  <li key={index} className="rounded-lg border p-3">
                    <InlineQuestionEditor
                      initial={question}
                      onSave={(updated) => {
                        onEdit(index, updated);
                        setEditingIndex(null);
                      }}
                      onCancel={() => setEditingIndex(null)}
                    />
                  </li>
                ) : (
                  <li key={index} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`mt-0.5 h-7 w-7 shrink-0 ${
                            selected.has(index) ? "text-primary" : "text-muted-foreground"
                          }`}
                          title={selected.has(index) ? "Deselect question" : "Select question"}
                          aria-pressed={selected.has(index)}
                          disabled={editing}
                          onClick={() => toggleSelected(index)}
                        >
                          {selected.has(index) ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </Button>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {index + 1}. {question.prompt}
                            </span>
                            <Badge variant="secondary">{typeLabel(question.type)}</Badge>
                            <span className="text-xs text-muted-foreground">{pointsLabel(question.points)}</span>
                          </div>
                          {question.options ? (
                            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                              {question.options.map((option, optionIndex) => (
                                <li key={optionIndex}>
                                  {String.fromCharCode(65 + optionIndex)}. {option}
                                  {isCorrectOption(question, optionIndex) ? " ✓ correct" : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">Theory answer — graded manually.</p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          title="Edit question"
                          disabled={editing}
                          onClick={() => setEditingIndex(index)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title="Remove question"
                          disabled={editing}
                          onClick={() => onRemove(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </>
      )}

      <DialogFooter showCloseButton={false}>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || questions.length === 0 || editing}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Import {questions.length} question{questions.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Inline editor for a single parsed question: text, type, options, answer
 * key and points. Validates locally; the server re-validates on import.
 */
function InlineQuestionEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: ImportedQuestion;
  onSave: (question: ImportedQuestion) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<"objective" | "multiple" | "written">(initial.type);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [options, setOptions] = useState<string[]>(
    initial.options ? [...initial.options] : ["", "", "", ""]
  );
  const [correct, setCorrect] = useState<string>(
    initial.correctOption !== null && initial.correctOption !== undefined
      ? String(initial.correctOption)
      : "0"
  );
  const [correctMulti, setCorrectMulti] = useState<Set<number>>(
    () => new Set(initial.correctOptions ?? [])
  );
  const [points, setPoints] = useState(String(initial.points));

  const optionLetters = ["A", "B", "C", "D", "E", "F"];

  function toggleCorrectMulti(index: number) {
    setCorrectMulti((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleSave() {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) {
      toast.error("Question text is required (at least 3 characters).");
      return;
    }
    const parsedPoints = Number(points);
    if (!Number.isInteger(parsedPoints) || parsedPoints < 1 || parsedPoints > 100) {
      toast.error("Points must be a whole number between 1 and 100.");
      return;
    }

    if (type === "written") {
      onSave({
        type: "written",
        prompt: trimmedPrompt,
        options: null,
        correctOption: null,
        correctOptions: null,
        points: parsedPoints,
      });
      return;
    }

    const cleaned = options.map((option) => option.trim());
    if (cleaned.length < 2 || cleaned.some((option) => option === "")) {
      toast.error("Option questions need at least two non-empty options.");
      return;
    }

    if (type === "objective") {
      const correctIndex = Number(correct);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= cleaned.length) {
        toast.error("Choose the correct option.");
        return;
      }
      onSave({
        type,
        prompt: trimmedPrompt,
        options: cleaned,
        correctOption: correctIndex,
        correctOptions: null,
        points: parsedPoints,
      });
      return;
    }

    const indices = [...correctMulti].filter((index) => index < cleaned.length).sort();
    if (indices.length < 1) {
      toast.error("Choose at least one correct option.");
      return;
    }
    onSave({
      type,
      prompt: trimmedPrompt,
      options: cleaned,
      correctOption: null,
      correctOptions: indices,
      points: parsedPoints,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Edit question</p>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="space-y-2">
          <Label htmlFor="preview-question-text">Question</Label>
          <Textarea
            id="preview-question-text"
            rows={2}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(value) => setType(value as "objective" | "multiple" | "written")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="objective">Objective</SelectItem>
              <SelectItem value="multiple">Multiple answer</SelectItem>
              <SelectItem value="written">Written</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {type === "objective" || type === "multiple" ? (
        <div className="space-y-2">
          <Label>Options</Label>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-xs font-medium text-muted-foreground">
                {optionLetters[index]}
              </span>
              <Input
                value={option}
                placeholder="Answer option"
                onChange={(event) =>
                  setOptions((prev) => prev.map((o, i) => (i === index ? event.target.value : o)))
                }
              />
              {options.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  title="Remove option"
                  onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
          {options.length < 6 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => setOptions((prev) => [...prev, ""])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add option
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Theory answer — graded manually.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "objective" ? (
          <div className="space-y-2">
            <Label>Correct option</Label>
            <Select value={correct} onValueChange={setCorrect}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((_, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {optionLetters[index]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : type === "multiple" ? (
          <div className="space-y-2">
            <Label>Correct options</Label>
            <div className="flex flex-wrap gap-2">
              {options.map((_, index) => (
                <label
                  key={index}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    correctMulti.has(index)
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={correctMulti.has(index)}
                    onChange={() => toggleCorrectMulti(index)}
                  />
                  {optionLetters[index]}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="preview-question-points">Points</Label>
          <Input
            id="preview-question-points"
            type="number"
            min={1}
            max={100}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/** Question builder used for both adding a new question and editing an existing one. */
function QuestionForm({
  exam,
  initial,
  onSubmit,
}: {
  exam: ExamListItem;
  /** When set, the form is pre-filled and edits this question. */
  initial: QuestionRow | null;
  onSubmit: (formData: FormData) => void;
}) {
  const isEdit = initial !== null;
  const [type, setType] = useState<"objective" | "multiple" | "written">(
    initial?.type ?? "objective"
  );
  const [correct, setCorrect] = useState(
    initial?.correctOption !== null && initial?.correctOption !== undefined
      ? String(initial.correctOption)
      : "0"
  );
  const [correctMulti, setCorrectMulti] = useState<Set<number>>(
    () => new Set(initial?.correctOptions ?? [])
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  function toggleCorrectMulti(index: number) {
    setCorrectMulti((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-primary" />
          {isEdit ? "Edit question" : <>Add question to &quot;{exam.title}&quot;</>}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? exam.topic
            : "Build questions one at a time. The window closes after saving so you can add the next one."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={type}
          onValueChange={(value) => setType(value as "objective" | "multiple" | "written")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="objective">Multiple choice (one answer)</SelectItem>
            <SelectItem value="multiple">Multiple choice (several answers)</SelectItem>
            <SelectItem value="written">Written</SelectItem>
          </SelectContent>
        </Select>
        <input type="hidden" name="type" value={type} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="question-prompt">Question</Label>
        <Textarea
          id="question-prompt"
          name="prompt"
          rows={2}
          required
          placeholder="Enter the question text"
          defaultValue={initial?.prompt ?? ""}
        />
      </div>
      {type === "objective" || type === "multiple" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-2">
              <Label htmlFor={`option-${index}`}>Option {String.fromCharCode(65 + index)}</Label>
              <Input
                id={`option-${index}`}
                name={`option${index}`}
                placeholder="Answer option"
                required
                defaultValue={initial?.options?.[index] ?? ""}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "objective" ? (
          <div className="space-y-2">
            <Label htmlFor="correct">Correct option</Label>
            <Select value={correct} onValueChange={setCorrect}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">A</SelectItem>
                <SelectItem value="1">B</SelectItem>
                <SelectItem value="2">C</SelectItem>
                <SelectItem value="3">D</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="correctOption" value={correct} />
          </div>
        ) : type === "multiple" ? (
          <div className="space-y-2">
            <Label>Correct options</Label>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((index) => (
                <label
                  key={index}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    correctMulti.has(index)
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    name={`correctOption${index}`}
                    checked={correctMulti.has(index)}
                    onChange={() => toggleCorrectMulti(index)}
                  />
                  {String.fromCharCode(65 + index)}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select every option that counts as correct. The trainee must pick exactly these.
            </p>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="question-points">Points</Label>
          <Input
            id="question-points"
            name="points"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={initial?.points ?? 1}
          />
        </div>
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit">
          {isEdit ? (
            <>
              <Pencil className="h-4 w-4" />
              Save changes
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add question
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function OpenExamForm({ exam, onSubmit }: { exam: ExamListItem; onSubmit: (closesAt: string) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("closesAt") ?? "").trim();
    const close = value ? new Date(value) : new Date(Date.now() + 24 * 3600_000);
    if (Number.isNaN(close.getTime())) return;
    onSubmit(close.toISOString());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Open &quot;{exam.title}&quot;
        </DialogTitle>
        <DialogDescription>
          Trainees can take it any time between now and the closing time you set.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="exam-closes">Close at (optional)</Label>
        <Input id="exam-closes" name="closesAt" type="datetime-local" placeholder="Defaults to 24 hours from now" />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit">Open exam</Button>
      </DialogFooter>
    </form>
  );
}

function EditExamForm({ exam, onSubmit }: { exam: ExamListItem; onSubmit: (formData: FormData) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit exam</DialogTitle>
        <DialogDescription>{exam.topic}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="edit-exam-title">Title</Label>
        <Input id="edit-exam-title" name="title" defaultValue={exam.title} required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-exam-duration">Duration (minutes)</Label>
        <Input id="edit-exam-duration" name="durationMinutes" type="number" min={1} max={240} required defaultValue={exam.durationMinutes} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-exam-description">Description (optional)</Label>
        <Textarea id="edit-exam-description" name="description" rows={2} defaultValue={exam.description ?? ""} />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit">Save changes</Button>
      </DialogFooter>
    </form>
  );
}

function GradeWrittenForm({
  exam,
  submission,
  onSubmit,
}: {
  exam: ExamListItem;
  submission: SubmissionRow;
  onSubmit: (grades: Record<string, number>) => void;
}) {
  // FEAT-06: prefill with the LLM's suggested scores when available — the
  // trainer reviews each one and can keep or override it before saving.
  const [grades, setGrades] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      submission.writtenQuestions.map((question) => [
        question.id,
        submission.llmGrades?.[question.id] !== undefined
          ? String(submission.llmGrades[question.id])
          : "",
      ])
    )
  );

  const hasLlmSuggestions = submission.llmGrades !== null &&
    Object.keys(submission.llmGrades ?? {}).length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed: Record<string, number> = {};
    for (const question of submission.writtenQuestions) {
      const value = Number(grades[question.id]);
      if (grades[question.id] === "" || Number.isNaN(value) || value < 0 || value > question.points) {
        toast.error(`Score for "${question.prompt.slice(0, 40)}…" must be between 0 and ${question.points}.`);
        return;
      }
      parsed[question.id] = value;
    }
    onSubmit(parsed);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Grade written answers
        </DialogTitle>
        <DialogDescription>
          {exam.title} — {submission.traineeName}. Objective score: {submission.autoScore ?? 0}/{submission.totalPoints}.
        </DialogDescription>
      </DialogHeader>
      {hasLlmSuggestions ? (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold-foreground">
          AI suggested grades are pre-filled below. Review each answer and adjust the score
          before saving — only the grade you save is shown to the trainee.
        </p>
      ) : null}
      <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
        {submission.writtenQuestions.map((question, index) => {
          const suggested = submission.llmGrades?.[question.id];
          return (
          <div key={question.id} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">
              {index + 1}. {question.prompt}
              <span className="ml-1 text-xs text-muted-foreground">({question.points} pts)</span>
            </p>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">
              {question.answer || "No answer given."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={`grade-${question.id}`} className="shrink-0 text-xs text-muted-foreground">
                Score
              </Label>
              <Input
                id={`grade-${question.id}`}
                type="number"
                min={0}
                max={question.points}
                value={grades[question.id]}
                onChange={(event) =>
                  setGrades((prev) => ({ ...prev, [question.id]: event.target.value }))
                }
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">/ {question.points}</span>
              {suggested !== undefined ? (
                <span className="text-[11px] text-muted-foreground">
                  AI suggested {suggested}
                </span>
              ) : null}
            </div>
          </div>
          );
        })}
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit">Save grades</Button>
      </DialogFooter>
    </form>
  );
}
