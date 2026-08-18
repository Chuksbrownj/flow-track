import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { listNotifications } from "@/lib/actions/notifications";
import { NotificationsClient } from "@/components/layout/notifications-client";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireUser();
  const notifications = await listNotifications();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Updates about new exams and quizzes opened by your trainers.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                When a trainer opens a new exam or quiz, you&apos;ll see it here.
              </p>
            </div>
          ) : (
            <NotificationsClient initial={notifications} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
