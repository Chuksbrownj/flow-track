"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { authenticate } from "@/app/login/actions";

export function LoginForm({
  identifierLabel = "Email",
  identifierPlaceholder = "you@example.com",
  buttonLabel = "Sign in",
  showRememberMe = false,
}: {
  identifierLabel?: string;
  identifierPlaceholder?: string;
  buttonLabel?: string;
  showRememberMe?: boolean;
} = {}) {
  const [error, formAction, isPending] = useActionState(authenticate, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="identifier">{identifierLabel}</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="identifier"
            name="identifier"
            type="text"
            placeholder={identifierPlaceholder}
            autoComplete="username"
            required
            autoFocus
            className="pl-10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <a
            href="/forgot-password"
            className="text-xs font-medium text-primary underline-offset-3 hover:underline"
          >
            Forgot password?
          </a>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <PasswordInput
            id="password"
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="pl-10"
          />
        </div>
      </div>
      {showRememberMe && (
        <div className="flex items-center space-x-2">
          <Checkbox id="remember" name="remember" />
          <Label htmlFor="remember" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Remember me
          </Label>
        </div>
      )}
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <Button
        type="submit"
        className="w-full bg-gold hover:bg-gold/90 text-gold-foreground font-semibold"
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Signing in..." : buttonLabel}
        {!isPending && (
          <span className="ml-2">→</span>
        )}
      </Button>
    </form>
  );
}
