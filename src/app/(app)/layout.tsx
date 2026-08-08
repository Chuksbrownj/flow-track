import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role === "admin" ? "admin" : "trainee";
  const displayName =
    role === "admin"
      ? session.user.name ?? "Administrator"
      : session.user.name?.trim().split(/\s+/)[0] || "Trainee";

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <MobileNav role={role} />
          <div className="ml-auto flex items-center gap-3">
            <UserMenu name={displayName} email={session.user.email ?? ""} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
