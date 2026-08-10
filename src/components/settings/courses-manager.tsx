"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCourse } from "@/lib/actions/courses";

export function CoursesManager({
  courses,
  isMaster,
}: {
  courses: { id: string; name: string; active: boolean }[];
  isMaster: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name.trim());
      const result = await addCourse(formData);
      if (result.ok) {
        setName("");
        toast.success(result.message ?? "Course added.");
        router.refresh();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {courses.length} active course{courses.length === 1 ? "" : "s"}. New courses
          automatically become score sheet columns and exam topics.
        </p>
        {isMaster ? null : (
          <p className="text-xs text-muted-foreground">Only the master admin can add courses.</p>
        )}
      </div>

      {courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No courses yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {courses.map((course) => (
            <li key={course.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
                  <BookOpen className="h-4 w-4" />
                </div>
                <p className="truncate text-sm font-medium">{course.name}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">/100 per week</span>
            </li>
          ))}
        </ul>
      )}

      {isMaster ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <div className="space-y-2">
            <Label htmlFor="new-course">New course</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="new-course"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Web Development"
                required
                minLength={3}
                maxLength={60}
                className="flex-1"
              />
              <Button type="submit" disabled={isPending || name.trim().length < 3} className="gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isPending ? "Adding..." : "Add course"}
              </Button>
            </div>
          </div>
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
