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
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <svg
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-heading text-primary">FlowTrack</h1>
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
        <LoginForm identifierLabel="Registration Code" identifierPlaceholder="e.g. 123456" buttonLabel="Sign in" />
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
