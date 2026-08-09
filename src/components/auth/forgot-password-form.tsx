"use client";

import { useActionState } from "react";
import { AlertCircle, KeyRound, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/actions/password-reset";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, undefined);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            If an account exists for that email or registration code, a password reset link has been
            sent. Check your inbox (and spam folder) and follow the link to set a new password.
          </span>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">Email or registration code</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          placeholder="you@example.com or 2024001"
          autoComplete="username"
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Staff: use your email. Students: use your registration code (a reset link goes to the
          email saved in your profile).
        </p>
      </div>
      {state?.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {isPending ? "Sending link..." : "Send reset link"}
      </Button>
    </form>
  );
}
