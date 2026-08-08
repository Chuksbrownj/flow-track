"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, Pencil, Search, Trophy } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAssessment, type AssessmentInput } from "@/lib/actions/assessments";

const CATEGORIES = [
  { key: "graphicDesign", label: "Graphic Design" },
  { key: "animation", label: "2D & 3D Animation" },
  { key: "dataAnalysis", label: "Data Analysis" },
  { key: "hpLife", label: "HP LIFE" },
] as const;

type ScoreKey = (typeof CATEGORIES)[number]["key"];

export type TraineeRow = {
  id: string;
  registrationNumber: string;
  fullName: string;
  status: string;
};

export type AssessmentRow = {
  traineeId: string;
  graphicDesign: number | null;
  animation: number | null;
  dataAnalysis: number | null;
  hpLife: number | null;
};

function emptyDraft(): Record<ScoreKey, string> {
  return { graphicDesign: "", animation: "", dataAnalysis: "", hpLife: "" };
}

function draftFrom(row: AssessmentRow | undefined): Record<ScoreKey, string> {
  if (!row) return emptyDraft();
  return {
    graphicDesign: row.graphicDesign?.toString() ?? "",
    animation: row.animation?.toString() ?? "",
    dataAnalysis: row.dataAnalysis?.toString() ?? "",
    hpLife: row.hpLife?.toString() ?? "",
  };
}

function average(row: AssessmentRow | undefined): number | null {
  if (!row) return null;
  const scores = [row.graphicDesign, row.animation, row.dataAnalysis, row.hpLife].filter(
    (value): value is number => value !== null
  );
  if (scores.length === 0) return null;
  const total = scores.reduce((sum, value) => sum + value, 0);
  return Math.round((total / scores.length) * 10) / 10;
}

export function AssessmentsClient({
  trainees,
  initialAssessments,
}: {
  trainees: TraineeRow[];
  initialAssessments: AssessmentRow[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(trainees[0]?.id ?? null);
  const [assessments, setAssessments] = useState<Record<string, AssessmentRow>>(
    Object.fromEntries(initialAssessments.map((row) => [row.traineeId, row]))
  );
  const [draft, setDraft] = useState<Record<ScoreKey, string>>(() =>
    draftFrom(initialAssessments.find((row) => row.traineeId === trainees[0]?.id))
  );
  const [isPending, startTransition] = useTransition();

  const selected = trainees.find((t) => t.id === selectedId) ?? null;
  const selectedAssessment = selectedId ? assessments[selectedId] : undefined;
  const averageScore = average(selectedAssessment);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trainees;
    return trainees.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        t.registrationNumber.toLowerCase().includes(q)
    );
  }, [trainees, query]);

  function selectTrainee(id: string) {
    setSelectedId(id);
    setDraft(draftFrom(assessments[id]));
  }

  function setScore(key: ScoreKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!selectedId || !selected) return;

    const scores: AssessmentInput = {};
    let hasScore = false;
    for (const category of CATEGORIES) {
      const raw = draft[category.key].trim();
      if (raw === "") continue;
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 0 || num > 100) {
        toast.error(`${category.label} must be a whole number between 0 and 100.`);
        return;
      }
      scores[category.key] = num;
      hasScore = true;
    }
    if (!hasScore && !selectedAssessment) {
      toast.error("Enter at least one score.");
      return;
    }

    startTransition(async () => {
      const result = await saveAssessment(selectedId, scores);
      if (result.ok) {
        setAssessments((prev) => ({
          ...prev,
          [selectedId]: {
            traineeId: selectedId,
            graphicDesign: scores.graphicDesign ?? null,
            animation: scores.animation ?? null,
            dataAnalysis: scores.dataAnalysis ?? null,
            hpLife: scores.hpLife ?? null,
          },
        }));
        toast.success("Assessment saved.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
        <p className="text-sm text-muted-foreground">
          Record and update trainee scores across the four programme areas.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trainees</CardTitle>
            <CardDescription>Select a trainee to view or enter scores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or registration number..."
                className="pl-9"
                aria-label="Search trainees"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {trainees.length === 0 ? "No trainees yet" : "No matching trainees"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {trainees.length === 0
                      ? "Add trainees in the Trainees module first."
                      : "Try a different search."}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((trainee) => {
                  const row = assessments[trainee.id];
                  const avg = average(row);
                  const isSelected = trainee.id === selectedId;
                  return (
                    <li key={trainee.id}>
                      <button
                        type="button"
                        onClick={() => selectTrainee(trainee.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{trainee.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {trainee.registrationNumber}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {avg !== null ? (
                            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold-foreground">
                              {avg}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not recorded</span>
                          )}
                          <StatusBadge status={trainee.status} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessment summary</CardTitle>
            <CardDescription>
              {selected
                ? `${selected.fullName} (${selected.registrationNumber})`
                : "Select a trainee to begin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
                <GraduationCap className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">No trainee selected</p>
                <p className="text-xs text-muted-foreground">Choose a trainee from the list.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {CATEGORIES.map((category) => (
                    <div key={category.key} className="space-y-2">
                      <Label htmlFor={`score-${category.key}`} className="text-xs font-medium">
                        {category.label}
                      </Label>
                      <Input
                        id={`score-${category.key}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        placeholder="—"
                        value={draft[category.key]}
                        onChange={(event) => setScore(category.key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Overall average</p>
                      <p className="text-xs text-muted-foreground">
                        Across recorded categories only
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold">
                    {averageScore !== null ? `${averageScore}%` : "—"}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    {isPending ? "Saving..." : "Save scores"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
