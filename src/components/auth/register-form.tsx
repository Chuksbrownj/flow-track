"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Headset, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { registerTrainee } from "@/lib/actions/auth";
import { submitSupportTicket } from "@/lib/actions/support";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState("");
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerTrainee(new FormData(event.currentTarget));
      if (result.ok) {
        router.push("/login?registered=1");
      } else if (result.blocked) {
        setBlockedCode(
          String(new FormData(event.currentTarget).get("registrationNumber") ?? "").trim()
        );
        setError(result.error ?? "Contact admin for help.");
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="registrationNumber">Registration code</Label>
          <Input
            id="registrationNumber"
            name="registrationNumber"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 2024001"
            required
            minLength={3}
            maxLength={30}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Enter the registration code you were issued with. You&apos;ll use it to sign in.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            placeholder="e.g. Ada Obi"
            required
            minLength={3}
            autoComplete="name"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="e.g. 08012345678"
              required
              minLength={7}
              maxLength={20}
              autoComplete="tel"
            />
          </div>
        </div>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
            {blockedCode ? (
              <Button
                type="button"
                variant="link"
                className="ml-1 h-auto p-0 text-sm font-medium text-primary"
                onClick={() => setTicketNumber(null)}
              >
                <Headset className="mr-1 h-3.5 w-3.5" />
                Contact Admin
              </Button>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {isPending ? "Creating account..." : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Your registration will be confirmed by a trainer before you can sign in.
        </p>
      </form>

      <Dialog
        open={!!blockedCode}
        onOpenChange={(open) => {
          if (!open) {
            setBlockedCode(null);
            setTicketNumber(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {ticketNumber ? (
            <div className="space-y-3 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Headset className="h-6 w-6" />
              </div>
              <DialogHeader>
                <DialogTitle>Ticket {ticketNumber} created</DialogTitle>
                <DialogDescription>
                  Your ticket number has been emailed to you. The admin team will follow up on your
                  issue shortly. Keep this number for reference.
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="outline"
                onClick={() => {
                  setBlockedCode(null);
                  setTicketNumber(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <SupportTicketForm
              registrationNumber={blockedCode}
              onSubmitted={setTicketNumber}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupportTicketForm({
  registrationNumber,
  onSubmitted,
}: {
  registrationNumber: string | null;
  onSubmitted: (ticketNumber: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (registrationNumber) formData.set("registrationNumber", registrationNumber);
    startTransition(async () => {
      const result = await submitSupportTicket(formData);
      if (result.ok && result.ticketNumber) {
        onSubmitted(result.ticketNumber);
      } else {
        setError(result.error ?? "Could not submit the form. Try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Headset className="h-4 w-4 text-primary" />
          Contact Admin
        </DialogTitle>
        <DialogDescription>
          This registration code belongs to a deleted record. Tell us what happened and the admin
          team will follow up.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-name">Name</Label>
          <Input id="support-name" name="name" required minLength={3} placeholder="Your full name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-email">Email</Label>
          <Input id="support-email" name="email" type="email" required placeholder="you@example.com" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="support-phone">Phone number</Label>
          <Input id="support-phone" name="phone" type="tel" placeholder="e.g. 08012345678" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-registration">Registration number</Label>
          <Input
            id="support-registration"
            name="registrationNumber"
            defaultValue={registrationNumber ?? ""}
            placeholder="e.g. 2024001"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="support-description">Describe the issue</Label>
        <Textarea
          id="support-description"
          name="description"
          rows={3}
          required
          minLength={10}
          placeholder="Tell us what happened..."
        />
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter showCloseButton={false}>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headset className="h-4 w-4" />}
          {isPending ? "Submitting..." : "Submit request"}
        </Button>
      </DialogFooter>
    </form>
  );
}
