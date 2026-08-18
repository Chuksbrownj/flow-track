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
import { AssessmentsClient, type ScoreRow } from "@/components/assessments/assessments-client";
import { ExamsClient, type ExamListItem, type SubmissionRow } from "@/components/assessments/exams-client";
import { TraineeExams, type TraineeExamRow } from "@/components/assessments/trainee-exams";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatWeek, weekKey } from "@/lib/date";
import { listCourses } from "@/lib/courses";

export const metadata = { title: "Assessments" };

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            Take assessments opened by your trainers. Exams run in full-screen mode.
          </p>
        </div>
        <TraineeExams exams={list} />
      </div>
    );
  }

  // ─── Staff: exam management + weekly score sheet ────────────────────────
  const { tab, week } = await searchParams;
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
  const selectedWeek = week && WEEK_PATTERN.test(week) ? week : currentWeek;

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
    database
      .select()
      .from(assessmentScores)
      .where(eq(assessmentScores.week, selectedWeek)),
  ]);

  const weekSet = new Set<string>([currentWeek, ...weekRows.map((row) => row.week)]);
  const weeks = [...weekSet].sort().reverse().map((value) => ({ value, label: formatWeek(value) }));

  const initialAssessments: Record<string, ScoreRow> = {};
  for (const row of scoreRows) {
    initialAssessments[row.traineeId] = {
      ...(initialAssessments[row.traineeId] ?? {}),
      [row.courseId]: row.score,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
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
          <ExamsClient
            exams={examList}
            canCreateAnyTopic={isAdmin}
            trainerTopic={user.topic ?? null}
            courses={courseList.map((course) => course.name)}
          />
        </TabsContent>
        <TabsContent value="scores" className="pt-4">
          <AssessmentsClient
            key={selectedWeek}
            trainees={scoreTrainees}
            initialAssessments={initialAssessments}
            week={selectedWeek}
            weeks={weeks}
            courses={courseList}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
