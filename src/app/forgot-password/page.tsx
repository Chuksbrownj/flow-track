import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) {
    const isStaff = session.user.role === "admin" || session.user.role === "trainer";
    redirect(isStaff ? "/dashboard" : "/portal");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-secondary/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Forgot password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-3 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
