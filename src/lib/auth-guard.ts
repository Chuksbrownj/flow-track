import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types/user-role";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

/** Master admin only. */
export async function requireMasterAdmin() {
  const user = await requireUser();
  if (user.role !== "master_admin") redirect("/dashboard");
  return user;
}

/** Master admin or admin (trainer) — any staff member. */
export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "master_admin" && user.role !== "admin") redirect("/portal");
  return user;
}

export type { UserRole };
