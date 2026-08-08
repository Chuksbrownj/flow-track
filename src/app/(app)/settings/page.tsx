import { Building2, Info, ShieldCheck } from "lucide-react";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { requireStaff } from "@/lib/auth-guard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Settings" };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default async function SettingsPage() {
  await requireStaff();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Organisation and programme information.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Organisation
            </CardTitle>
            <CardDescription>Programme owner details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Organisation" value="OYA Waste Management Limited" />
            <Field label="Programme" value="HYPREP Digital Skills Training Programme" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Application
            </CardTitle>
            <CardDescription>About this system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Application" value="FlowTrack" />
            <Field label="Version" value="0.1.0" />
            <p className="text-sm text-muted-foreground">
              Training management system for the OYA / HYPREP Digital Skills Training Programme.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Update your account password.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
