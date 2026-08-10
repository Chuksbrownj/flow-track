"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Fingerprint, KeyRound, Loader2, RotateCcw, ShieldX, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetDeviceBinding } from "@/lib/actions/attendance";
import { markTraineeDeleted, resetStudentPassword, restoreTrainee, suspendTrainee } from "@/lib/actions/trainees";
import type { TraineeRow } from "./trainee-form";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value || "—"}</p>
    </div>
  );
}

export function TraineeDetails({
  trainee,
  isMaster,
}: {
  trainee: TraineeRow;
  isMaster: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
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

  function handlePasswordReset() {
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const result = await resetStudentPassword(trainee.id, password);
      if (result.ok) {
        setResetOpen(false);
        setPassword("");
        toast.success("Password reset. Share the new password with the student.");
        router.refresh();
      } else {
        setPasswordError(result.error ?? "Could not reset the password.");
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Password</p>
            <p className="text-xs text-muted-foreground">
              Set a new sign-in password for this student (e.g. if they forgot it and have no email
              on file).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setPassword("");
            setPasswordError(null);
            setResetOpen(true);
          }}
        >
          <KeyRound className="h-4 w-4" />
          Reset password
        </Button>
      </div>

      {isMaster ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-gold-foreground">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {trainee.status === "dormant" ? "Dormant account" : "Account access"}
              </p>
              <p className="text-xs text-muted-foreground">
                {trainee.status === "dormant"
                  ? "This student cannot sign in. Restore the account to reactivate it."
                  : "Suspend the account immediately (dormant) or mark it for permanent deletion."}
              </p>
            </div>
          </div>
          {trainee.status === "dormant" ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-primary"
              disabled={isPending}
              onClick={async () => {
                const result = await restoreTrainee(trainee.id);
                if (result.ok) {
                  toast.success(result.message ?? "Account restored.");
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Something went wrong.");
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Restore
            </Button>
          ) : trainee.status !== "deleted" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-gold-foreground"
                onClick={() => setSuspendOpen(true)}
              >
                <Ban className="h-4 w-4" />
                Suspend
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

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

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {trainee.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account becomes dormant immediately and the student can no longer sign in. You can
              restore it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isPending}
              onClick={async () => {
                const result = await suspendTrainee(trainee.id);
                if (result.ok) {
                  toast.success(result.message ?? "Account suspended.");
                  setSuspendOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Something went wrong.");
                }
              }}
            >
              <Ban className="h-4 w-4" />
              Suspend account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {trainee.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account is immediately marked for deletion — the student can no longer sign in.
              All personal and performance data is purged from the database after 1 week. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={async () => {
                const result = await markTraineeDeleted(trainee.id);
                if (result.ok) {
                  toast.success(result.message ?? "Marked for deletion.");
                  setDeleteOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Something went wrong.");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Mark for deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Reset password
            </DialogTitle>
            <DialogDescription>
              Set a new sign-in password for {trainee.fullName}. They will need to use it on their
              next login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="student-new-password">New password</Label>
            <Input
              id="student-new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
            />
            {passwordError ? (
              <p className="text-xs font-medium text-destructive">{passwordError}</p>
            ) : null}
          </div>
          <DialogFooter showCloseButton={false}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handlePasswordReset} disabled={isPending || !password.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {isPending ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
