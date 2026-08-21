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
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-secondary-container/10 p-4 antialiased">
      {/* Decorative background pattern */}
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
        {/* Ambient glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative z-10 mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary shadow-inner transition-transform duration-300 hover:rotate-3">
            <svg
              className="h-7 w-7 text-on-primary"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">FlowTrack</h1>
          <p className="mt-1 max-w-[250px] text-center text-sm text-on-surface-variant">
            OYA / HYPREP Digital Skills Training Programme
          </p>
        </div>

        {changed ? (
          <p className="relative z-10 mb-4 rounded-lg border border-primary/20 bg-primary-container/10 px-3 py-2.5 text-center text-sm text-primary">
            Password updated successfully. Please sign in with your new password.
          </p>
        ) : null}
        {registered ? (
          <p className="relative z-10 mb-4 rounded-lg border border-secondary/30 bg-secondary-container/10 px-3 py-2.5 text-center text-sm text-on-secondary-container">
            Account created. A trainer will confirm your registration before you can sign in.
          </p>
        ) : null}

        <LoginForm identifierLabel="Registration Code" identifierPlaceholder="e.g. 123456" buttonLabel="Sign in" buttonVariant="primary" />

        <p className="relative z-10 mt-6 text-center text-sm text-on-surface-variant">
          New student?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary-container hover:decoration-primary"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
