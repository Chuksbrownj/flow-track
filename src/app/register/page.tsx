import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect(session.user.role === "admin" ? "/dashboard" : "/portal");

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/70 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <span className="text-lg font-bold">FT</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Register as a trainee of the OYA / HYPREP Digital Skills Training Programme.
          </p>
        </div>
        <RegisterForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-3 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
