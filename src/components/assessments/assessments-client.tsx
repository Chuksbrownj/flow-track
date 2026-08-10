"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Loader2, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveAssessment, type AssessmentInput } from "@/lib/actions/assessments";
import { formatWeek } from "@/lib/date";

export type CourseOption = { id: string; name: string };

export type TraineeRow = {
  id: string;
  registrationNumber: string | null;
  fullName: string;
  status: string;
};

/** Scores for a trainee keyed by course id. */
export type ScoreRow = Record<string, number>;

export type WeekOption = { value: string; label: string };

/** Short header label, e.g. "Graphic Design" → "GD", "2D & 3D Animation" → "2D/3D". */
function shortCourse(name: string): string {
  const trimmed = name.trim();
  if (/^2d/i.test(trimmed) || /^3d/i.test(trimmed)) return "2D/3D";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

function emptyDraft(courses: CourseOption[]): Record<string, string> {
  return Object.fromEntries(courses.map((course) => [course.id, ""]));
}

function draftFrom(row: ScoreRow | undefined, courses: CourseOption[]): Record<string, string> {
  if (!row) return emptyDraft(courses);
  return Object.fromEntries(
    courses.map((course) => [course.id, row[course.id]?.toString() ?? ""])
  );
}

function totals(draft: Record<string, string>, courses: CourseOption[]) {
  let total = 0;
  let entered = 0;
  for (const course of courses) {
    const raw = draft[course.id].trim();
    if (raw === "") continue;
    const num = Number(raw);
    if (Number.isInteger(num)) {
      total += num;
      entered += 1;
    }
  }
  return {
    total,
    percent: entered === 0 ? null : Math.round((total / courses.length) * 10) / 10,
  };
}

export function AssessmentsClient({
  trainees,
  initialAssessments,
  week,
  weeks,
  courses,
}: {
  trainees: TraineeRow[];
  /** Scores for the currently selected week, keyed by trainee id then course id. */
  initialAssessments: Record<string, ScoreRow>;
  /** Currently selected week (Monday of the week, YYYY-MM-DD). */
  week: string;
  /** Selectable weeks, newest first. */
  weeks: WeekOption[];
  /** Active courses — one score column per course. */
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const trainee of trainees) {
      map[trainee.id] = draftFrom(initialAssessments[trainee.id], courses);
    }
    return map;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trainees;
    return trainees.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        (t.registrationNumber?.toLowerCase().includes(q) ?? false)
    );
  }, [trainees, query]);

  function setScore(traineeId: string, courseId: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [traineeId]: { ...prev[traineeId], [courseId]: value },
    }));
  }

  function handleSave(traineeId: string) {
    const draft = drafts[traineeId];
    if (!draft) return;

    const scores: AssessmentInput = {};
    let hasScore = false;
    for (const course of courses) {
      const raw = draft[course.id].trim();
      if (raw === "") continue;
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 0 || num > 100) {
        toast.error(`${course.name} must be a whole number between 0 and 100.`);
        return;
      }
      scores[course.id] = num;
      hasScore = true;
    }
    if (!hasScore) {
      toast.error("Enter at least one score.");
      return;
    }

    setSavingId(traineeId);
    startTransition(async () => {
      const result = await saveAssessment(traineeId, week, scores);
      setSavingId(null);
      if (result.ok) {
        toast.success("Scores saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function changeWeek(next: string) {
    if (!next || next === week) return;
    router.push(`/assessments?tab=scores&week=${next}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Score sheet</h1>
          <p className="text-sm text-muted-foreground">
            Weekly scores out of 100 per course. Grand total and percentage are calculated
            automatically.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select value={week} onValueChange={changeWeek}>
            <SelectTrigger className="w-full" aria-label="Select week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            {formatWeek(week)}
          </CardTitle>
          <CardDescription>
            {filtered.length} of {trainees.length} students
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or OYA ID..."
              className="pl-9"
              aria-label="Search students"
            />
          </div>

          {trainees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No students yet</p>
              <p className="text-xs text-muted-foreground">
                Add students in the Trainees module first.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <Search className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No matching students</p>
              <p className="text-xs text-muted-foreground">Try a different search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>OYA ID</TableHead>
                    <TableHead>Name</TableHead>
                    {courses.map((course) => (
                      <TableHead key={course.id} title={course.name}>
                        {shortCourse(course.name)}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          /100
                        </span>
                      </TableHead>
                    ))}
                    <TableHead>Grand total</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead className="text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((trainee) => {
                    const draft = drafts[trainee.id] ?? emptyDraft(courses);
                    const { total, percent } = totals(draft, courses);
                    const busy = savingId === trainee.id;
                    return (
                      <TableRow key={trainee.id}>
                        <TableCell className="font-medium tabular-nums">
                          {trainee.registrationNumber ?? "—"}
                        </TableCell>
                        <TableCell className="min-w-32">{trainee.fullName}</TableCell>
                        {courses.map((course) => (
                          <TableCell key={course.id}>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={100}
                              placeholder="—"
                              aria-label={`${trainee.fullName} ${course.name}`}
                              value={draft[course.id]}
                              onChange={(event) =>
                                setScore(trainee.id, course.id, event.target.value)
                              }
                              className="h-9 w-16"
                            />
                          </TableCell>
                        ))}
                        <TableCell className="font-semibold tabular-nums">{total}</TableCell>
                        <TableCell className="tabular-nums">
                          {percent !== null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold-foreground">
                              <Trophy className="h-3 w-3" />
                              {percent}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-primary"
                            disabled={busy}
                            onClick={() => handleSave(trainee.id)}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <GraduationCap className="h-4 w-4" />
                            )}
                            {busy ? "Saving..." : "Save"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
