import { eq } from "drizzle-orm";
import { ArrowRight, CalendarCheck2, UserCircle } from "lucide-react";
import Link from "next/link";
import { ProfileView } from "@/components/profile/profile-view";
import { StatusBadge } from "@/components/app/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { formatDate } from "@/lib/date";
import { maskEmail, maskPhone } from "@/lib/mask";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  if (user.role === "master_admin" || user.role === "admin") redirect("/dashboard");

  const [trainee] = await db()
    .select({
      id: trainees.id,
      fullName: trainees.fullName,
      registrationNumber: trainees.registrationNumber,
      gender: trainees.gender,
      email: trainees.email,
      phone: trainees.phone,
      status: trainees.status,
      createdAt: trainees.createdAt,
      deviceFingerprint: trainees.deviceFingerprint,
    })
    .from(trainees)
    .where(eq(trainees.userId, user.id ?? ""))
    .limit(1);

  if (!trainee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-heading text-primary">Profile</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-primary">Profile</h1>
          <p className="text-sm text-muted-foreground">
            {trainee.registrationNumber ?? "Registration pending"}
          </p>
        </div>
        <StatusBadge status={trainee.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-primary" />
            Personal details
          </CardTitle>
          <CardDescription>Your registration details.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileView
            fullName={trainee.fullName}
            registrationNumber={trainee.registrationNumber}
            gender={trainee.gender}
            joined={formatDate(trainee.createdAt.toISOString())}
            maskedEmail={maskEmail(trainee.email)}
            maskedPhone={maskPhone(trainee.phone)}
          />
        </CardContent>
      </Card>

      <Link
        href="/attendance"
        className="flex items-center justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
            <CalendarCheck2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Attendance</p>
            <p className="text-xs text-muted-foreground">
              Check in and view your attendance record.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
