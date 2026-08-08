import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Staff sign in" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const session = await auth();
  const { changed } = await searchParams;
  if (session?.user) {
    redirect(session.user.role === "admin" || session.user.role === "trainer" ? "/dashboard" : "/portal");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-secondary/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Staff sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            OYA / HYPREP Digital Skills Training Programme
          </p>
        </div>
        {changed ? (
          <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-primary">
            Password updated successfully. Please sign in with your new password.
          </p>
        ) : null}
        <LoginForm emailPlaceholder="admin@thrilled.com" buttonLabel="Sign in to dashboard" />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Are you a trainee?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-3 hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </main>
  );
}
