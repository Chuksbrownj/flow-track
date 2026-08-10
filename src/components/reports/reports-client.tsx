"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TraineeReportRow = {
  registrationNumber: string | null;
  fullName: string;
  gender: string;
  phone: string;
  email: string | null;
  status: string;
};

export type AttendanceReportRow = {
  date: string;
  traineeName: string;
  registrationNumber: string | null;
  status: string;
};

export type AssessmentReportRow = {
  traineeName: string;
  registrationNumber: string | null;
  scores: { courseId: string; score: number }[];
};

export type AssessmentAverage = {
  courseId: string;
  courseName: string;
  average: number | null;
};

type Cell = string | number | null | undefined;

function toCsv(headers: string[], rows: Cell[][]) {
  const escape = (cell: Cell) => {
    if (cell === null || cell === undefined) return "";
    const value = String(cell);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ReportCard({
  title,
  description,
  exportLabel,
  onExport,
  disabled,
  className,
  children,
}: {
  title: string;
  description: string;
  exportLabel: string;
  onExport: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onExport} disabled={disabled}>
            <Download className="h-4 w-4" />
            {exportLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReportsClient({
  traineeStats,
  attendanceStats,
  assessmentAverages,
  trainees,
  attendance,
  assessments,
}: {
  traineeStats: {
    total: number;
    active: number;
    inactive: number;
    pending: number;
    genders: { gender: string; count: number }[];
  };
  attendanceStats: { present: number; absent: number; rate: number | null };
  assessmentAverages: AssessmentAverage[];
  trainees: TraineeReportRow[];
  attendance: AttendanceReportRow[];
  assessments: AssessmentReportRow[];
}) {
  function exportTrainees() {
    download(
      "trainees.csv",
      toCsv(
        ["Registration number", "Full name", "Gender", "Phone", "Email", "Status"],
        trainees.map((row) => [
          row.registrationNumber,
          row.fullName,
          row.gender,
          row.phone,
          row.email,
          row.status,
        ])
      )
    );
  }

  function exportAttendance() {
    download(
      "attendance.csv",
      toCsv(
        ["Date", "Trainee", "Registration number", "Status"],
        attendance.map((row) => [row.date, row.traineeName, row.registrationNumber, row.status])
      )
    );
  }

  function exportAssessments() {
    download(
      "assessments.csv",
      toCsv(
        ["Trainee", "Registration number", ...assessmentAverages.map((avg) => avg.courseName), "Average"],
        assessments.map((row) => {
          const scoreByCourse = new Map(row.scores.map((score) => [score.courseId, score.score]));
          const values = assessmentAverages
            .map((avg) => scoreByCourse.get(avg.courseId) ?? null)
            .filter((value): value is number => value !== null);
          const average =
            values.length === 0
              ? null
              : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
          return [
            row.traineeName,
            row.registrationNumber,
            ...assessmentAverages.map((avg) => scoreByCourse.get(avg.courseId) ?? null),
            average,
          ];
        })
      )
    );
  }

  const totalGenders = traineeStats.genders.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Trainee, attendance and assessment summaries with CSV export.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportCard
          title="Trainees"
          description="Registered trainees by status and gender."
          exportLabel="Export CSV"
          onExport={exportTrainees}
          disabled={traineeStats.total === 0}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={traineeStats.total} />
            <Stat label="Active" value={traineeStats.active} />
            <Stat label="Pending" value={traineeStats.pending} />
            <Stat label="Inactive" value={traineeStats.inactive} />
          </div>
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gender summary
            </p>
            {traineeStats.genders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trainees recorded.</p>
            ) : (
              traineeStats.genders.map((row) => (
                <div key={row.gender} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm">{row.gender}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${totalGenders ? (row.count / totalGenders) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-medium">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </ReportCard>

        <ReportCard
          title="Attendance"
          description="Attendance records across all dates."
          exportLabel="Export CSV"
          onExport={exportAttendance}
          disabled={attendance.length === 0}
        >
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Present" value={attendanceStats.present} />
            <Stat label="Absent" value={attendanceStats.absent} />
            <Stat label="Rate" value={attendanceStats.rate !== null ? `${attendanceStats.rate}%` : "—"} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {attendance.length} attendance records exported.
          </p>
        </ReportCard>

        <ReportCard
          title="Assessments"
          description="Average scores by programme area."
          exportLabel="Export CSV"
          onExport={exportAssessments}
          disabled={assessments.length === 0}
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {assessmentAverages.map((avg) => (
              <Stat
                key={avg.courseId}
                label={avg.courseName}
                value={avg.average !== null ? `${avg.average}%` : "—"}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {assessments.length} trainee assessments exported.
          </p>
        </ReportCard>
      </div>
    </div>
  );
}
