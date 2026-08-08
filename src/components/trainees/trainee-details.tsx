"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fingerprint, Loader2, ShieldX } from "lucide-react";
import { formatDate } from "@/lib/date";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resetDeviceBinding } from "@/lib/actions/attendance";
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
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await resetDeviceBinding(trainee.id);
      if (result.ok) {
        toast.success("Device binding reset. The trainee can check in from a new device.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
            <Fingerprint className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Device binding</p>
            <p className="text-xs text-muted-foreground">
              {trainee.hasDevice
                ? "A device is registered for check-in."
                : "No device registered yet — the trainee's first check-in binds one."}
            </p>
          </div>
        </div>
        {trainee.hasDevice ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <ShieldX className="h-4 w-4" />
            Reset device
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset device binding?</AlertDialogTitle>
            <AlertDialogDescription>
              {trainee.fullName} will be able to register a new device on their next check-in. The
              current device will no longer work for attendance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Reset device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
