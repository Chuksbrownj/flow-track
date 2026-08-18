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
import { PasswordInput } from "@/components/ui/password-input";

export type TraineeRow = {
  id: string;
  registrationNumber: string | null;
  fullName: string;
  gender: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  hasDevice?: boolean;
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
  const [masterPassword, setMasterPassword] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: ActionResult =
        mode === "create"
          ? await createTrainee(formData)
          : await updateTrainee(trainee!.id, masterPassword, formData);
      if (result.ok) {
        onSuccess();
      } else {
        setError(result.error ?? "Something went wrong.");
        setMasterPassword("");
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
          placeholder="e.g. 2024001"
          defaultValue={trainee?.registrationNumber ?? ""}
          inputMode="numeric"
          pattern="[0-9]*"
          required={mode === "create" || trainee?.status !== "pending"}
          minLength={3}
          maxLength={30}
        />
        {trainee?.status === "pending" ? (
          <p className="text-xs text-muted-foreground">
            Assigned automatically when this trainee is approved.
          </p>
        ) : null}
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
      {mode === "create" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The trainee signs in with their registration number (or email) and this password.
          </p>
        </>
      ) : null}
      {mode === "edit" ? (
        <div className="space-y-2">
          <Label htmlFor="masterPassword">Master admin password</Label>
          <PasswordInput
            id="masterPassword"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
            placeholder="Enter your password to confirm"
            autoComplete="current-password"
            required
          />
          <p className="text-xs text-muted-foreground">
            Changes only take effect after the master admin password is verified.
          </p>
        </div>
      ) : null}
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
