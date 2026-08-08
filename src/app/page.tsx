import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isStaff = session.user.role === "admin" || session.user.role === "trainer";
  redirect(isStaff ? "/dashboard" : "/portal");
}
