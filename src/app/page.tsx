import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isStaff = session.user.role === "master_admin" || session.user.role === "admin";
  redirect(isStaff ? "/dashboard" : "/portal");
}
