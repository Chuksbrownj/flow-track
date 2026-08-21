import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata = { title: "Staff sign in" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const session = await auth();
  const { changed } = await searchParams;
  if (session?.user) {
    redirect(
      session.user.role === "master_admin" || session.user.role === "admin" ? "/dashboard" : "/portal"
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">FT</span>
            </div>
            <h1 className="text-2xl font-bold font-heading text-primary">FlowTrack</h1>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Staff Portal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Secure access for administrators.
          </p>
        </div>
        {changed ? (
          <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-primary">
            Password updated successfully. Please sign in with your new password.
          </p>
        ) : null}
        <LoginForm buttonLabel="Sign in" showRememberMe />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <GraduationCap className="inline h-4 w-4 mr-1" />
          Are you a student?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-3 hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </main>
  );
}
