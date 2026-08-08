import { formatDate } from "@/lib/date";
import { StatusBadge } from "@/components/app/status-badge";
import type { TraineeRow } from "./trainee-form";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value || "—"}</p>
    </div>
  );
}

export function TraineeDetails({ trainee }: { trainee: TraineeRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Registration number" value={trainee.registrationNumber} />
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
        <StatusBadge status={trainee.status} />
      </div>
      <Field label="Full name" value={trainee.fullName} />
      <Field label="Gender" value={trainee.gender} />
      <Field label="Phone" value={trainee.phone} />
      <Field label="Email" value={trainee.email} />
      <Field label="Registered" value={formatDate(trainee.createdAt)} />
    </div>
  );
}
