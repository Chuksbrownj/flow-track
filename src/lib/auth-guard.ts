import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** Master admin or trainer (any staff member). */
export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "trainer") redirect("/portal");
  return user;
}
