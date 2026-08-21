import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { countOpenSupportTickets } from "@/lib/actions/support";
import { countUnreadNotifications } from "@/lib/actions/notifications";
import { NotificationBell } from "@/components/layout/notification-bell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const displayName =
    role === "master_admin"
      ? session.user.name ?? "Administrator"
      : role === "admin"
        ? session.user.name ?? "Admin"
        : session.user.name?.trim().split(/\s+/)[0] || "Student";

  const isStaff = role === "master_admin" || role === "admin";
  const openTicketCount = isStaff ? await countOpenSupportTickets() : 0;
  const unreadNotifications = role === "student" ? await countUnreadNotifications() : 0;

  const roleLabel =
    role === "master_admin"
      ? "Master Administrator"
      : role === "admin"
        ? "Administrator"
        : "Student";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          role={role}
          openTicketCount={openTicketCount}
          userName={displayName}
          userRole={roleLabel}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-outline-variant/30 bg-surface/80 px-4 backdrop-blur-md md:px-6">
            <MobileNav role={role} openTicketCount={openTicketCount} />
            <SidebarToggle role={role} />
            <h1 className="hidden font-heading text-lg font-semibold text-primary md:block">
              {isStaff ? "Overview" : "My Portal"}
            </h1>
            <div className="ml-auto flex items-center gap-2 md:gap-3">
              {isStaff ? <NotificationBell count={openTicketCount} /> : <NotificationBell count={unreadNotifications} />}
              <ThemeToggle />
              <UserMenu name={displayName} email={session.user.email ?? ""} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-20 md:p-6 md:pb-6 lg:px-8 lg:py-8">{children}</main>
        </div>
        {role === "student" ? <MobileBottomNav unreadCount={unreadNotifications} /> : null}
      </div>
    </SidebarProvider>
  );
}
