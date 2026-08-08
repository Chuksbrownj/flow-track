"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createStaff,
  deleteStaff,
  resetStaffPassword,
  updateStaff,
} from "@/lib/actions/staff";
import { TOPIC_LABELS } from "@/lib/topics";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  topic: string | null;
  createdAt: string;
};

function useBusy() {
  const [pending, startTransition] = useTransition();
  return { pending, startTransition };
}

export function StaffClient({
  currentUserId,
  staff,
}: {
  currentUserId: string;
  staff: StaffRow[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const { pending, startTransition } = useBusy();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success("Saved.");
        onOk?.();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Only the master admin can create and manage admins and trainers.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              Add staff
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <CreateStaffForm
              pending={pending}
              onSubmit={(formData) =>
                run(() => createStaff(formData), () => {
                  setCreateOpen(false);
                  router.refresh();
                })
              }
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Admins &amp; trainers
          </CardTitle>
          <CardDescription>
            {staff.length} staff account{staff.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
          ) : (
            <ul className="divide-y">
              {staff.map((row) => {
                const isSelf = row.id === currentUserId;
                return (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {row.name}
                          {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                        </p>
                        <Badge variant={row.role === "admin" ? "default" : "secondary"}>
                          {row.role === "admin" ? "Master admin" : "Trainer"}
                        </Badge>
                        {row.role === "trainer" && row.topic ? (
                          <Badge variant="outline">{row.topic}</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setEditTarget(row)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setResetTarget(row)}
                      >
                        <KeyRound className="h-4 w-4" />
                        Reset password
                      </Button>
                      {!isSelf && row.role === "trainer" ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete trainer?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {row.name} will lose access to the system. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => run(() => deleteStaff(row.id))}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {editTarget ? (
            <EditStaffForm
              key={editTarget.id}
              target={editTarget}
              pending={pending}
              onSubmit={(formData) =>
                run(() => updateStaff(editTarget.id, formData), () => {
                  setEditTarget(null);
                  router.refresh();
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {resetTarget ? (
            <ResetPasswordForm
              key={resetTarget.id}
              target={resetTarget}
              pending={pending}
              onSubmit={(formData) =>
                run(() => resetStaffPassword(resetTarget.id, formData), () =>
                  setResetTarget(null)
                )
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateStaffForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [role, setRole] = useState("trainer");
  const [topic, setTopic] = useState<string>(TOPIC_LABELS[0]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          New staff account
        </DialogTitle>
        <DialogDescription>
          Set an initial password — the staff member can change it from Settings.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="staff-name">Full name</Label>
        <Input id="staff-name" name="name" required minLength={3} placeholder="e.g. Tunde Bakare" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-email">Email</Label>
        <Input id="staff-email" name="email" type="email" required placeholder="trainer@example.com" />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trainer">Trainer</SelectItem>
            <SelectItem value="admin">Master admin</SelectItem>
          </SelectContent>
        </Select>
        <input type="hidden" name="role" value={role} />
      </div>
      {role === "trainer" ? (
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPIC_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="topic" value={topic} />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="staff-password">Initial password</Label>
        <Input
          id="staff-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {pending ? "Creating..." : "Create account"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditStaffForm({
  target,
  pending,
  onSubmit,
}: {
  target: StaffRow;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [role, setRole] = useState(target.role);
  const [topic, setTopic] = useState<string>(target.topic ?? TOPIC_LABELS[0]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit staff account</DialogTitle>
        <DialogDescription>{target.email}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="edit-name">Full name</Label>
        <Input id="edit-name" name="name" defaultValue={target.name} required minLength={3} />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trainer">Trainer</SelectItem>
            <SelectItem value="admin">Master admin</SelectItem>
          </SelectContent>
        </Select>
        <input type="hidden" name="role" value={role} />
      </div>
      {role === "trainer" ? (
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPIC_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="topic" value={topic} />
        </div>
      ) : null}
      <DialogFooter showCloseButton={false}>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ResetPasswordForm({
  target,
  pending,
  onSubmit,
}: {
  target: StaffRow;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Reset password
        </DialogTitle>
        <DialogDescription>
          Set a new password for {target.name}. They will need to sign in again.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {pending ? "Resetting..." : "Reset password"}
        </Button>
      </DialogFooter>
    </form>
  );
}
