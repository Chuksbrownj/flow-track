"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Clock3, GraduationCap, Loader2, Play } from "lucide-react";
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
import { startExam, type ExamSession } from "@/lib/actions/exams";
import { ExamPlayer } from "./exam-player";

export type TraineeExamRow = {
  id: string;
  title: string;
  topic: string;
  description: string | null;
  durationMinutes: number;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  takeable: boolean;
  submission: {
    status: string;
    autoScore: number | null;
    writtenScore: number | null;
    totalPoints: number;
  } | null;
};

export function TraineeExams({ exams }: { exams: TraineeExamRow[] }) {
  const [session, setSession] = useState<ExamSession | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open(examId: string) {
    setPendingId(examId);
    startTransition(async () => {
      const result = await startExam(examId);
      setPendingId(null);
      if (result.ok && result.session) {
        setSession(result.session);
      } else {
        toast.error(result.error ?? "Could not open the exam.");
      }
    });
  }

  if (session) {
    return (
      <ExamPlayer
        session={session}
        onDone={() => {
          setSession(null);
          // Re-fetch the list so the new status shows.
          window.location.reload();
        }}
      />
    );
  }

  if (exams.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <GraduationCap className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">No assessments yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            When a trainer opens an assessment, it will appear here for you to take.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {exams.map((exam) => {
        const submission = exam.submission;
        const hasResult = submission?.status === "submitted" || submission?.status === "graded";
        const percent = hasResult
          ? submission!.totalPoints > 0
            ? Math.round(
                ((submission!.autoScore ?? 0) + (submission!.writtenScore ?? 0)) /
                  submission!.totalPoints *
                  100
              )
            : null
          : null;
        const busy = pendingId === exam.id;

        return (
          <Card key={exam.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {exam.title}
                    <Badge variant="secondary">{exam.topic}</Badge>
                    {hasResult ? (
                      <StatusBadge status={submission!.status} />
                    ) : (
                      <StatusBadge status={exam.takeable ? "pending" : exam.status} />
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {exam.durationMinutes} minutes
                    </span>
                    {exam.closesAt ? (
                      <span>closes {new Date(exam.closesAt).toLocaleString("en-GB")}</span>
                    ) : null}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {hasResult ? (
                    <>
                      {percent !== null ? (
                        <Badge variant={percent >= 50 ? "default" : "destructive"}>{percent}%</Badge>
                      ) : null}
                      <Button size="sm" className="gap-1.5" onClick={() => open(exam.id)}>
                        <GraduationCap className="h-4 w-4" />
                        View result
                      </Button>
                    </>
                  ) : exam.takeable ? (
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => open(exam.id)}>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : submission?.status === "in_progress" ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {busy
                        ? "Opening..."
                        : submission?.status === "in_progress"
                          ? "Resume"
                          : "Start exam"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      {exam.status === "closed" ? "Closed" : "Not open yet"}
                    </Button>
                  )}
                </div>
              </div>
              {exam.description ? (
                <CardDescription>{exam.description}</CardDescription>
              ) : null}
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
