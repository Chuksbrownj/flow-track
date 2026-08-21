import { and, asc, count, desc, eq, isNull, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import {
  assessmentScores,
  examQuestions,
  exams,
  examSubmissions,
  trainees,
  users,
} from "@/db/schema";
import { AssessmentsClient } from "@/components/assessments/assessments-client";
import { ExamsClient, type ExamListItem, type SubmissionRow } from "@/components/assessments/exams-client";
import { TraineeExams, type TraineeExamRow } from "@/components/assessments/trainee-exams";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { weekKey } from "@/lib/date";
import { listCourses } from "@/lib/courses";
import { GraduationCap } from "lucide-react";

export const metadata = { title: "Assessments" };

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; week?: string }>;
}) {
  const user = await requireUser();
  const database = db();

  // ─── Student: take exams opened by staff ────────────────────────────────
  if (user.role === "student") {
    const [trainee] = await database
      .select({ id: trainees.id })
      .from(trainees)
      .where(eq(trainees.userId, user.id ?? ""))
      .limit(1);

    if (!trainee) {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </p>
        </div>
      );
    }

    const [examRows, submissionRows, questionTypeRows] = await Promise.all([
      database
        .select()
        .from(exams)
        .where(isNull(exams.deletedAt))
        .orderBy(desc(exams.createdAt)),
      database.select().from(examSubmissions).where(eq(examSubmissions.traineeId, trainee.id)),
      database
        .select({ examId: examQuestions.examId, type: examQuestions.type })
        .from(examQuestions)
        .where(isNull(examQuestions.deletedAt)),
    ]);
    const now = new Date();
    const hasWrittenByExam = new Map<string, boolean>();
    for (const row of questionTypeRows) {
      if (row.type === "written") hasWrittenByExam.set(row.examId, true);
    }

    const list: TraineeExamRow[] = examRows
      .filter(
        (exam) =>
          exam.status !== "draft" ||
          submissionRows.some((submission) => submission.examId === exam.id)
      )
      .map((exam) => {
        const submission = submissionRows.find((row) => row.examId === exam.id);
        const takeable =
          exam.status === "open" &&
          (!exam.opensAt || now >= exam.opensAt) &&
          (!exam.closesAt || now <= exam.closesAt);
        return {
          id: exam.id,
          title: exam.title,
          topic: exam.topic,
          description: exam.description,
          durationMinutes: exam.durationMinutes,
          status: exam.status,
          opensAt: exam.opensAt?.toISOString() ?? null,
          closesAt: exam.closesAt?.toISOString() ?? null,
          takeable,
          submission: submission
            ? {
                status: submission.status,
                autoScore: submission.autoScore,
                writtenScore: submission.writtenScore,
                totalPoints: submission.totalPoints,
                // FEAT-05: a submission is only "graded" once the full exam has
                // been graded (auto + reviewed written answers).
                graded:
                  submission.status === "graded" ||
                  (submission.status === "submitted" &&
                    !hasWrittenByExam.get(exam.id)),
              }
            : null,
        };
      });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading text-primary">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            Manage and monitor student examinations, track progress, and review completed assessments.
          </p>
        </div>
        <TraineeExams exams={list} />
      </div>
    );
  }

  // ─── Staff: exam management + weekly score sheet ────────────────────────
  const { tab } = await searchParams;
  const staffId = user.id ?? "";
  const isAdmin = user.role === "master_admin";
  const examWhere = isAdmin ? undefined : eq(exams.createdById, staffId);

  const [examRows, questionCountRows, questionRows, submissionRows, traineeRows, staffRows, writtenRows, courseList] =
    await Promise.all([
      examWhere
        ? database
            .select()
            .from(exams)
            .where(and(examWhere, isNull(exams.deletedAt)))
            .orderBy(desc(exams.createdAt))
        : database
            .select()
            .from(exams)
            .where(isNull(exams.deletedAt))
            .orderBy(desc(exams.createdAt)),
      database
        .select({ examId: examQuestions.examId, value: count() })
        .from(examQuestions)
        .where(isNull(examQuestions.deletedAt))
        .groupBy(examQuestions.examId),
      database
        .select()
        .from(examQuestions)
        .where(isNull(examQuestions.deletedAt))
        .orderBy(asc(examQuestions.order)),
      database.select().from(examSubmissions),
      database.select({ id: trainees.id, fullName: trainees.fullName, registrationNumber: trainees.registrationNumber }).from(trainees),
      database.select({ id: users.id, name: users.name }).from(users),
      database
        .select()
        .from(examQuestions)
        .where(and(eq(examQuestions.type, "written"), isNull(examQuestions.deletedAt))),
      listCourses(),
    ]);

  const questionCountByExam = new Map(questionCountRows.map((row) => [row.examId, row.value]));
  const questionsByExam = new Map<string, typeof questionRows>();
  for (const row of questionRows) {
    const list = questionsByExam.get(row.examId) ?? [];
    list.push(row);
    questionsByExam.set(row.examId, list);
  }
  const traineeName = new Map(traineeRows.map((row) => [row.id, row]));
  const staffName = new Map(staffRows.map((row) => [row.id, row.name]));
  const writtenByExam = new Map<string, typeof writtenRows>();
  for (const row of writtenRows) {
    const list = writtenByExam.get(row.examId) ?? [];
    list.push(row);
    writtenByExam.set(row.examId, list);
  }

  const examList: ExamListItem[] = examRows.map((exam) => {
    const submissions: SubmissionRow[] = submissionRows
      .filter((submission) => submission.examId === exam.id)
      .map((submission) => {
        const answers = submission.answers
          ? (JSON.parse(submission.answers) as Record<string, string>)
          : {};
        const written = (writtenByExam.get(exam.id) ?? []).map((question) => ({
          id: question.id,
          prompt: question.prompt,
          points: question.points,
          answer: answers[question.id] ?? "",
        }));
        const trainee = traineeName.get(submission.traineeId);
        return {
          id: submission.id,
          traineeName: trainee?.fullName ?? "Unknown trainee",
          registrationNumber: trainee?.registrationNumber ?? null,
          status: submission.status,
          autoScore: submission.autoScore,
          writtenScore: submission.writtenScore,
          totalPoints: submission.totalPoints,
          fullscreenViolations: submission.fullscreenViolations,
          submittedAt: submission.submittedAt?.toISOString() ?? null,
          writtenQuestions: written,
          llmGrades: submission.llmGrades
            ? (JSON.parse(submission.llmGrades) as Record<string, number>)
            : null,
        };
      });

    return {
      id: exam.id,
      title: exam.title,
      topic: exam.topic,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      opensAt: exam.opensAt?.toISOString() ?? null,
      closesAt: exam.closesAt?.toISOString() ?? null,
      createdBy: exam.createdById ? staffName.get(exam.createdById) ?? null : null,
      questionCount: questionCountByExam.get(exam.id) ?? 0,
      questions: (questionsByExam.get(exam.id) ?? []).map((question) => ({
        id: question.id,
        type: question.type as "objective" | "multiple" | "written",
        prompt: question.prompt,
        options: question.options ? (JSON.parse(question.options) as string[]) : null,
        correctOption: question.correctOption,
        correctOptions: question.correctOptions
          ? (JSON.parse(question.correctOptions) as number[])
          : null,
        points: question.points,
      })),
      submissions,
    };
  });

  // ─── Weekly score sheet data ────────────────────────────────────────────
  const currentWeek = weekKey();

  const [weekRows, scoreTrainees, scoreRows] = await Promise.all([
    database
      .select({ week: assessmentScores.week })
      .from(assessmentScores)
      .groupBy(assessmentScores.week),
    database
      .select({
        id: trainees.id,
        registrationNumber: trainees.registrationNumber,
        fullName: trainees.fullName,
        status: trainees.status,
      })
      .from(trainees)
      .where(ne(trainees.status, "pending"))
      .orderBy(asc(trainees.fullName)),
    database.select().from(assessmentScores),
  ]);

  // Every week with a score, plus the current week (so there's always a column
  // to enter this week's scores). Sorted oldest first.
  const weekSet = new Set<string>([currentWeek, ...weekRows.map((row) => row.week)]);
  const weeks = [...weekSet].sort();

  // traineeId -> courseId -> week -> score
  const scores: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of scoreRows) {
    const traineeScores = (scores[row.traineeId] ??= {});
    const courseScores = (traineeScores[row.courseId] ??= {});
    courseScores[row.week] = row.score;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-primary">Assessments</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Create and manage exams, grade written answers, and record weekly scores."
            : `Manage exams for your course${user.topic ? ` (${user.topic})` : ""} and record weekly scores.`}
        </p>
      </div>

      <Tabs defaultValue={tab === "scores" ? "scores" : "exams"}>
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="scores">Score sheet</TabsTrigger>
        </TabsList>
        <TabsContent value="exams" className="pt-4">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  How to use exams
                </CardTitle>
                <CardDescription>
                  Create a draft exam, add questions, open it for trainees, then grade and close it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Create an exam</strong> — New exam, then set
                    the title, course, duration and description. It starts as a draft.
                  </li>
                  <li>
                    <strong className="text-foreground">Add questions</strong> — one by one with Add
                    question, or upload a CSV, Excel, PDF, Word, Markdown or HTML file with Upload
                    questions. Review the parsed questions (search, filter, edit, remove) before
                    importing. Preview shows the saved questions anytime — while the exam is still a
                    draft you can edit them from there; once it has started they are locked.
                  </li>
                  <li>
                    <strong className="text-foreground">Open the exam</strong> — pick a closing time.
                    Trainees are notified and take the exam in full-screen mode. They can move
                    freely between questions — Previous question goes back to earlier ones and
                    their answers are kept, so they can review or change them before submitting.
                  </li>
                  <li>
                    <strong className="text-foreground">Monitor attempts</strong> — Trainees lists who
                    is taking the exam, Results expands each attempt with scores. Exams run in
                    full-screen: pressing Escape more than twice, or pressing Escape (leaving
                    full-screen) and not returning within 10 seconds, auto-submits the exam. Trainees
                    can stay on the screen for the full exam time — the 10-second clock only runs
                    while they are out of full-screen. If that happens, Reopen lets the trainee
                    resume where they left off while the exam is still open.
                  </li>
                  <li>
                    <strong className="text-foreground">Grade and close</strong> — Grade written
                    answers from the results; a &ldquo;Grades saved successfully&rdquo; message confirms
                    the scores were saved. Objective answers are scored automatically. Then Close
                    the exam when you&apos;re done. A closed exam can be reopened if it was closed by
                    mistake.
                  </li>
                </ol>
              </CardContent>
            </Card>
            <ExamsClient
              exams={examList}
              canCreateAnyTopic={isAdmin}
              trainerTopic={user.topic ?? null}
              courses={courseList.map((course) => course.name)}
            />
          </div>
        </TabsContent>
        <TabsContent value="scores" className="pt-4">
          <AssessmentsClient
            trainees={scoreTrainees}
            courses={courseList}
            weeks={weeks}
            scores={scores}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
