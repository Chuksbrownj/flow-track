"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSession, updateSession, type ActionResult } from "@/lib/actions/schedule";

export const PROGRAMMES = [
  "Graphic Design",
  "2D & 3D Animation",
  "Data Analysis",
  "HP LIFE",
];

export type SessionRow = {
  id: string;
  title: string;
  programme: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string | null;
};

export function ScheduleForm({
  mode,
  session,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  session?: SessionRow;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [programme, setProgramme] = useState(session?.programme ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: ActionResult =
        mode === "create"
          ? await createSession(formData)
          : await updateSession(session!.id, formData);
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="e.g. Intro to Figma"
          defaultValue={session?.title}
          required
          minLength={3}
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <Label>Programme</Label>
        <Select value={programme} onValueChange={setProgramme}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select programme" />
          </SelectTrigger>
          <SelectContent>
            {PROGRAMMES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="programme" value={programme} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={session?.date} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startTime">Start time</Label>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={session?.startTime ?? "09:00"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">End time</Label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={session?.endTime ?? "16:00"}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What will be covered in this session?"
          defaultValue={session?.description ?? ""}
          rows={3}
        />
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPending ? "Saving..." : mode === "create" ? "Add session" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
