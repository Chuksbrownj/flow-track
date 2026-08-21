import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(session.user.role === "master_admin" ? "/dashboard" : "/portal");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background via-background to-secondary-container/10 p-4 antialiased overflow-hidden">
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
        <div className="relative z-10 mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-inner">
            <span className="text-lg font-bold text-on-primary">FT</span>
          </div>
          <h1 className="text-xl font-semibold text-on-surface">Create account</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Register as a student of the OYA / HYPREP Digital Skills Training Programme using your
            registration code.
          </p>
        </div>
        <RegisterForm />
        <p className="relative z-10 mt-6 text-center text-sm text-on-surface-variant">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary-container"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
