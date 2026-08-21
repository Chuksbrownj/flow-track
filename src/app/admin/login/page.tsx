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
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-secondary-container/10 p-4 antialiased overflow-hidden">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(var(--color-primary, #00685f) 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }} />
      <div className="pointer-events-none absolute top-0 right-0 h-96 w-96 -translate-y-20 translate-x-20 rounded-full bg-primary-fixed/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 translate-y-20 -translate-x-20 rounded-full bg-secondary-fixed/20 blur-3xl" />

      <div className="absolute right-4 top-5 z-50">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-xl border border-outline-variant/30 bg-surface/95 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md sm:p-10">
        <div className="pointer-events-none absolute top-0 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative mb-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-container shadow-sm">
              <span className="text-lg font-bold text-on-secondary-container">FT</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">FlowTrack</h1>
          </div>
          <h2 className="text-lg font-semibold text-on-surface">Staff Portal</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Secure access for administrators.
          </p>
        </div>

        {changed ? (
          <p className="relative mb-4 rounded-lg border border-primary/20 bg-primary-container/10 px-3 py-2.5 text-center text-sm text-primary">
            Password updated successfully. Please sign in with your new password.
          </p>
        ) : null}

        <LoginForm buttonLabel="Sign in" showRememberMe />

        <div className="relative mt-6 border-t border-outline-variant/20 pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-primary"
          >
            <GraduationCap className="h-4 w-4" />
            Are you a student? Login here
          </Link>
        </div>
      </div>
    </main>
  );
}
