import { eq } from "drizzle-orm";
import { ArrowRight, CalendarCheck2, Shield, Mail, User } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/app/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { trainees } from "@/db/schema";
import { maskPhone } from "@/lib/mask";

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

  const initials = trainee.fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold font-heading text-primary">{trainee.fullName}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full border bg-muted px-3 py-1 text-sm font-medium">
              {trainee.registrationNumber ?? "Pending"}
            </span>
            <StatusBadge status={trainee.status} />
          </div>
          <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            {trainee.gender}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" />
            Contact Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-b pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Address</p>
            <p className="mt-1 text-sm">{trainee.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone Number</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-sm">{maskPhone(trainee.phone)}</p>
              <Button variant="ghost" size="sm" className="text-primary h-8">
                Show
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Device Status</p>
                  <p className="text-xs text-primary font-medium">Verified</p>
                </div>
              </div>
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
          </CardContent>
        </Card>
        <Link href="/attendance">
          <Card className="bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck2 className="h-5 w-5" />
                  <p className="text-sm font-semibold">My Attendance</p>
                </div>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
