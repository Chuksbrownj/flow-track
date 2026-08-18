"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, GraduationCap, Loader2, Search, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveCourseScores, type CourseScoreInput } from "@/lib/actions/assessments";
import { formatWeek, weekKey } from "@/lib/date";

export type CourseOption = { id: string; name: string };

export type TraineeRow = {
  id: string;
  registrationNumber: string | null;
  fullName: string;
  status: string;
};

/** traineeId -> courseId -> week -> score */
export type ScoreGrid = Record<string, Record<string, Record<string, number>>>;

const GRAND_TOTAL_TAB = "grand-total";

/** Short column label, e.g. "2026-08-17" → "17 Aug". */
function weekLabel(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Parses a cell to a whole-number score (0–100), or null when blank/invalid. */
function parseCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isInteger(num) && num >= 0 && num <= 100 ? num : null;
}

export function AssessmentsClient({
  trainees,
  courses,
  weeks,
  scores,
}: {
  trainees: TraineeRow[];
  /** Active courses — one tab per course plus a grand-total tab. */
  courses: CourseOption[];
  /** Weeks to show as columns, oldest first (current week is always included). */
  weeks: string[];
  /** Saved scores keyed by trainee id, then course id, then week. */
  scores: ScoreGrid;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [newWeek, setNewWeek] = useState("");
  const [weekColumns, setWeekColumns] = useState<string[]>(weeks);
  const [drafts, setDrafts] = useState<Record<string, Record<string, Record<string, string>>>>(
    () => {
      const map: Record<string, Record<string, Record<string, string>>> = {};
      for (const [traineeId, courseMap] of Object.entries(scores)) {
        const traineeDrafts: Record<string, Record<string, string>> = {};
        for (const [courseId, weekMap] of Object.entries(courseMap)) {
          const courseDrafts: Record<string, string> = {};
          for (const [week, value] of Object.entries(weekMap)) {
            courseDrafts[week] = String(value);
          }
          traineeDrafts[courseId] = courseDrafts;
        }
        map[traineeId] = traineeDrafts;
      }
      return map;
    }
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
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

  function setScore(traineeId: string, courseId: string, week: string, value: string) {
    setDrafts((prev) => {
      const traineeDrafts = { ...(prev[traineeId] ?? {}) };
      const courseDrafts = { ...(traineeDrafts[courseId] ?? {}) };
      return {
        ...prev,
        [traineeId]: { ...traineeDrafts, [courseId]: { ...courseDrafts, [week]: value } },
      };
    });
  }

  function addWeek() {
    if (!newWeek) return;
    const key = weekKey(newWeek);
    setWeekColumns((prev) => (prev.includes(key) ? prev : [...prev, key].sort()));
    setNewWeek("");
  }

  function courseTotal(traineeId: string, courseId: string): number {
    let total = 0;
    for (const week of weekColumns) {
      total += parseCell(drafts[traineeId]?.[courseId]?.[week] ?? "") ?? 0;
    }
    return total;
  }

  function enteredCount(traineeId: string): number {
    let count = 0;
    for (const course of courses) {
      for (const week of weekColumns) {
        if (parseCell(drafts[traineeId]?.[course.id]?.[week] ?? "") !== null) count += 1;
      }
    }
    return count;
  }

  function handleSave(traineeId: string, courseId: string) {
    const hasValue = weekColumns.some(
      (week) => parseCell(drafts[traineeId]?.[courseId]?.[week] ?? "") !== null
    );
    const hasExisting = weekColumns.some(
      (week) => scores[traineeId]?.[courseId]?.[week] !== undefined
    );
    if (!hasValue && !hasExisting) {
      toast.error("Enter at least one score.");
      return;
    }

    const input: CourseScoreInput = {};
    for (const week of weekColumns) {
      const raw = (drafts[traineeId]?.[courseId]?.[week] ?? "").trim();
      if (raw === "") {
        input[week] = null;
        continue;
      }
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 0 || num > 100) {
        toast.error(`${weekLabel(week)} must be a whole number between 0 and 100.`);
        return;
      }
      input[week] = num;
    }

    const key = `${traineeId}:${courseId}`;
    setSavingKey(key);
    startTransition(async () => {
      const result = await saveCourseScores(traineeId, courseId, input);
      setSavingKey(null);
      if (result.ok) {
        toast.success("Scores saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const hasTrainees = trainees.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Score sheet</h1>
          <p className="text-sm text-muted-foreground">
            Each course has its own tab and every week is a column. The course total adds
            up all weeks and the grand total sums all courses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={newWeek}
            onChange={(event) => setNewWeek(event.target.value)}
            className="w-40"
            aria-label="Week start date"
          />
          <Button variant="outline" size="sm" onClick={addWeek} className="gap-1.5">
            <CalendarPlus className="h-4 w-4" />
            Add week
          </Button>
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Weekly scores
          </CardTitle>
          <CardDescription>
            {filtered.length} of {trainees.length} students · {weekColumns.length} weeks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasTrainees ? (
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
            <Tabs defaultValue={courses[0]?.id ?? GRAND_TOTAL_TAB}>
              <TabsList>
                {courses.map((course) => (
                  <TabsTrigger key={course.id} value={course.id}>
                    {course.name}
                  </TabsTrigger>
                ))}
                <TabsTrigger value={GRAND_TOTAL_TAB}>Grand total</TabsTrigger>
              </TabsList>

              {courses.map((course) => (
                <TabsContent key={course.id} value={course.id} className="pt-4">
                  <div className="overflow-x-auto rounded-lg border">
                    <Table className="min-w-[560px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>OYA ID</TableHead>
                          <TableHead>Name</TableHead>
                          {weekColumns.map((week) => (
                            <TableHead key={week} title={formatWeek(week)}>
                              {weekLabel(week)}
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                /100
                              </span>
                            </TableHead>
                          ))}
                          <TableHead>Course total</TableHead>
                          <TableHead className="text-right">Save</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((trainee) => {
                          const busy = savingKey === `${trainee.id}:${course.id}`;
                          return (
                            <TableRow key={trainee.id}>
                              <TableCell className="font-medium tabular-nums">
                                {trainee.registrationNumber ?? "—"}
                              </TableCell>
                              <TableCell className="min-w-32">{trainee.fullName}</TableCell>
                              {weekColumns.map((week) => (
                                <TableCell key={week}>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={100}
                                    placeholder="—"
                                    aria-label={`${trainee.fullName} ${course.name} ${weekLabel(week)}`}
                                    value={drafts[trainee.id]?.[course.id]?.[week] ?? ""}
                                    onChange={(event) =>
                                      setScore(trainee.id, course.id, week, event.target.value)
                                    }
                                    className="h-9 w-16"
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="font-semibold tabular-nums">
                                {courseTotal(trainee.id, course.id)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-primary"
                                  disabled={busy}
                                  onClick={() => handleSave(trainee.id, course.id)}
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
                </TabsContent>
              ))}

              <TabsContent value={GRAND_TOTAL_TAB} className="pt-4">
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>OYA ID</TableHead>
                        <TableHead>Name</TableHead>
                        {courses.map((course) => (
                          <TableHead key={course.id}>{course.name}</TableHead>
                        ))}
                        <TableHead>Grand total</TableHead>
                        <TableHead>Average %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((trainee) => {
                        const totals = courses.map((course) =>
                          courseTotal(trainee.id, course.id)
                        );
                        const grandTotal = totals.reduce((sum, value) => sum + value, 0);
                        const entered = enteredCount(trainee.id);
                        const percent =
                          entered === 0 ? null : Math.round((grandTotal / entered) * 10) / 10;
                        return (
                          <TableRow key={trainee.id}>
                            <TableCell className="font-medium tabular-nums">
                              {trainee.registrationNumber ?? "—"}
                            </TableCell>
                            <TableCell className="min-w-32">{trainee.fullName}</TableCell>
                            {totals.map((total, index) => (
                              <TableCell key={courses[index]?.id} className="tabular-nums">
                                {total}
                              </TableCell>
                            ))}
                            <TableCell className="font-semibold tabular-nums">
                              {grandTotal}
                            </TableCell>
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
