import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; registered?: string }>;
}) {
  const session = await auth();
  const { changed, registered } = await searchParams;
  if (session?.user) {
    const isStaff = session.user.role === "master_admin" || session.user.role === "admin";
    redirect(isStaff ? "/dashboard" : "/portal");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/70 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <span className="text-lg font-bold">FT</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">FlowTrack</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            OYA / HYPREP Digital Skills Training Programme
          </p>
        </div>
        {changed ? (
          <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-primary">
            Password updated successfully. Please sign in with your new password.
          </p>
        ) : null}
        {registered ? (
          <p className="mb-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-center text-sm text-gold-foreground">
            Account created. A trainer will confirm your registration before you can sign in.
          </p>
        ) : null}
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary underline-offset-3 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <LoginForm identifierLabel="Registration code" identifierPlaceholder="e.g. 2024001" />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          New student?{" "}
          <Link href="/register" className="font-medium text-primary underline-offset-3 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
