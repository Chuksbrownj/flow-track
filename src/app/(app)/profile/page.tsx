import { and, eq, gte, lte } from "drizzle-orm";
import { UserCircle } from "lucide-react";
import { ProfileView } from "@/components/profile/profile-view";
import { ProfileAttendance } from "@/components/profile/profile-attendance";
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
import { attendance, trainees } from "@/db/schema";
import { currentMonth, formatDate, monthRange, todayStr } from "@/lib/date";
import { maskEmail, maskPhone } from "@/lib/mask";

export const metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/dashboard");

  const { month } = await searchParams;
  const monthParam = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const { start, end } = monthRange(monthParam);

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
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No trainee profile is linked to this account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const [attendanceRows, todayRow] = await Promise.all([
    db()
      .select({ date: attendance.date, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.traineeId, trainee.id),
          gte(attendance.date, start),
          lte(attendance.date, end)
        )
      ),
    db()
      .select({ status: attendance.status })
      .from(attendance)
      .where(and(eq(attendance.traineeId, trainee.id), eq(attendance.date, todayStr())))
      .limit(1),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
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

      <ProfileAttendance
        month={monthParam}
        records={attendanceRows.map((row) => ({ date: row.date, status: row.status }))}
        todayStatus={todayRow[0]?.status ?? null}
        deviceRegistered={!!trainee.deviceFingerprint}
      />
    </div>
  );
}
