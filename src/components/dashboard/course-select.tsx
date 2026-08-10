"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectMyCourse } from "@/lib/actions/courses";

/**
 * First-login prompt for staff without a course. Once selected the field is
 * locked to the admin — only the master admin can change it afterwards.
 */
export function CourseSelectBanner({ courses }: { courses: string[] }) {
  const router = useRouter();
  const [course, setCourse] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!course) return;
    startTransition(async () => {
      const result = await selectMyCourse(course);
      if (result.ok) {
        toast.success(result.message ?? "Course selected.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Choose your course</p>
          <p className="text-xs text-muted-foreground">
            Pick the course you&apos;ll manage as a trainer. This can only be done once — ask the
            master admin if you need to change it later.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Select your course">
            <SelectValue placeholder="Select a course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={!course || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
