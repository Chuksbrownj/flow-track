import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/70 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-center text-sm text-destructive">
            This reset link is missing its token. Please request a new link.
          </p>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline-offset-3 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
