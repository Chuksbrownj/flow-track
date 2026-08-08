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
import { createTrainee, updateTrainee, type ActionResult } from "@/lib/actions/trainees";

export type TraineeRow = {
  id: string;
  registrationNumber: string;
  fullName: string;
  gender: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
};

export function TraineeForm({
  mode,
  trainee,
  onSuccess,
  onCancel,
}: {
  mode: "create" | "edit";
  trainee?: TraineeRow;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState(trainee?.gender ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: ActionResult =
        mode === "create"
          ? await createTrainee(formData)
          : await updateTrainee(trainee!.id, formData);
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
        <Label htmlFor="registrationNumber">Registration number</Label>
        <Input
          id="registrationNumber"
          name="registrationNumber"
          placeholder="e.g. OYA-0001"
          defaultValue={trainee?.registrationNumber}
          required
          minLength={3}
          maxLength={30}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          placeholder="e.g. Ada Obi"
          defaultValue={trainee?.fullName}
          required
          minLength={3}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="gender" value={gender} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="e.g. 08012345678"
            defaultValue={trainee?.phone}
            required
            minLength={7}
            maxLength={20}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="e.g. ada@example.com"
          defaultValue={trainee?.email ?? ""}
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
          {isPending ? "Saving..." : mode === "create" ? "Add trainee" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
