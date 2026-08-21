"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";

export type TraineeReportRow = {
  registrationNumber: string | null;
  fullName: string;
  gender: string;
  phone: string;
  email: string | null;
  status: string;
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

export function ReportsClient({
  traineeStats,
  assessmentAverages,
  trainees,
}: {
  traineeStats: {
    total: number;
    active: number;
    inactive: number;
    pending: number;
    genders: { gender: string; count: number }[];
  };
  assessmentAverages: AssessmentAverage[];
  trainees: TraineeReportRow[];
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

  const totalGenders = traineeStats.genders.reduce((sum, row) => sum + row.count, 0);
  const maleCount = traineeStats.genders.find((g) => g.gender?.toLowerCase() === "male")?.count ?? 0;
  const femaleCount = traineeStats.genders.find((g) => g.gender?.toLowerCase() === "female")?.count ?? 0;
  const malePercent = totalGenders > 0 ? Math.round((maleCount / totalGenders) * 100) : 0;
  const femalePercent = totalGenders > 0 ? Math.round((femaleCount / totalGenders) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-heading text-primary">Reports & Analytics</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Trainees</p>
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-3xl font-bold mt-1">{traineeStats.total.toLocaleString()}</p>
            <p className="text-xs text-emerald-600 mt-1">↑ +12% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active</p>
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-3xl font-bold mt-1">{traineeStats.active.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {traineeStats.total > 0 ? Math.round((traineeStats.active / traineeStats.total) * 100) : 0}% Active Rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-3xl font-bold mt-1">{traineeStats.pending.toLocaleString()}</p>
            <p className="text-xs text-amber-600 mt-1">Action Required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Gender Breakdown</p>
              <svg className="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold">{malePercent}%</span>
              <span className="text-2xl font-bold">{femalePercent}%</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">M</span>
              <span className="text-xs text-muted-foreground">F</span>
            </div>
            <div className="mt-2 h-2 flex gap-0.5">
              <div className="h-full rounded-l-full bg-primary" style={{ width: `${malePercent}%` }} />
              <div className="h-full rounded-r-full bg-gold" style={{ width: `${femalePercent}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Attendance Rate Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-2">
              {[75, 82, 78, 85, 88, 92].map((height, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-xs text-muted-foreground">{["Jan", "Feb", "Mar", "Apr", "May", "Jun"][i]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Assessment Averages by Course</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-end justify-between gap-2">
              {assessmentAverages.slice(0, 5).map((avg, i) => (
                <div key={avg.courseId} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${avg.average ?? 0}%`,
                      backgroundColor: i % 3 === 0 ? "var(--primary)" : i % 3 === 1 ? "var(--gold)" : "var(--chart-3)",
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">
                    {avg.courseName.length > 10 ? avg.courseName.slice(0, 10) + "..." : avg.courseName}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Trainee Details</CardTitle>
            <Button variant="outline" size="sm" onClick={exportTrainees} disabled={traineeStats.total === 0}>
              <Download className="h-4 w-4 mr-1.5" />
              Export to Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Course</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {trainees.slice(0, 5).map((trainee, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">{trainee.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{trainee.fullName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {assessmentAverages[i]?.courseName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trainee.status} />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-right">
                      {assessmentAverages[i]?.average !== null ? `${assessmentAverages[i]?.average}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
