"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, Eye, Loader2, Pencil, Plus, Search, UserCheck, UserX, Users } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/app/status-badge";
import { approveTrainee, setTraineeStatus } from "@/lib/actions/trainees";
import { formatDate } from "@/lib/date";
import { TraineeDetails } from "./trainee-details";
import { TraineeForm, type TraineeRow } from "./trainee-form";

export function TraineesClient({ initialTrainees }: { initialTrainees: TraineeRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTrainee, setEditTrainee] = useState<TraineeRow | null>(null);
  const [viewTrainee, setViewTrainee] = useState<TraineeRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<TraineeRow | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialTrainees.filter((trainee) => {
      const matchesStatus =
        statusFilter === "all" || trainee.status === statusFilter;
      const matchesQuery =
        !q ||
        trainee.fullName.toLowerCase().includes(q) ||
        (trainee.registrationNumber?.toLowerCase().includes(q) ?? false);
      return matchesStatus && matchesQuery;
    });
  }, [initialTrainees, query, statusFilter]);

  function handleApprove(trainee: TraineeRow) {
    setApproveId(trainee.id);
    startTransition(async () => {
      const result = await approveTrainee(trainee.id);
      setApproveId(null);
      if (result.ok) {
        toast.success(`${trainee.fullName} approved.`);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function toggleStatus(trainee: TraineeRow) {
    const next = trainee.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await setTraineeStatus(trainee.id, next);
      if (result.ok) {
        toast.success(next === "active" ? `${trainee.fullName} activated.` : `${trainee.fullName} deactivated.`);
        setStatusTarget(null);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trainees</h1>
          <p className="text-sm text-muted-foreground">
            {initialTrainees.length} registered
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add trainee
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or registration number..."
            className="pl-9"
            aria-label="Search trainees"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">
              {initialTrainees.length === 0 ? "No trainees yet" : "No matching trainees"}
            </p>
            <p className="text-sm text-muted-foreground">
              {initialTrainees.length === 0
                ? "Add your first trainee to get started."
                : "Try a different search or filter."}
            </p>
          </div>
          {initialTrainees.length === 0 ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add trainee
            </Button>
          ) : null}
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration no.</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trainee) => (
                  <TableRow key={trainee.id}>
                    <TableCell className="font-medium">{trainee.registrationNumber ?? "—"}</TableCell>
                    <TableCell>{trainee.fullName}</TableCell>
                    <TableCell>{trainee.gender}</TableCell>
                    <TableCell>{trainee.phone}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {trainee.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={trainee.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewTrainee(trainee)} aria-label="View details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditTrainee(trainee)} aria-label="Edit trainee">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {trainee.status === "pending" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-primary"
                            onClick={() => handleApprove(trainee)}
                            disabled={approveId === trainee.id}
                            aria-label="Approve trainee"
                          >
                            {approveId === trainee.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCheck className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStatusTarget(trainee)}
                            aria-label={trainee.status === "active" ? "Deactivate trainee" : "Activate trainee"}
                          >
                            {trainee.status === "active" ? (
                              <UserX className="h-4 w-4 text-destructive" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-primary" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((trainee) => (
              <div key={trainee.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{trainee.fullName}</p>
                    <p className="text-xs text-muted-foreground">{trainee.registrationNumber ?? "—"}</p>
                  </div>
                  <StatusBadge status={trainee.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p className="text-muted-foreground">Gender</p>
                  <p className="text-right">{trainee.gender}</p>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="text-right">{trainee.phone}</p>
                  <p className="text-muted-foreground">Registered</p>
                  <p className="text-right">{formatDate(trainee.createdAt)}</p>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViewTrainee(trainee)}>
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditTrainee(trainee)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  {trainee.status === "pending" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-primary"
                      onClick={() => handleApprove(trainee)}
                      disabled={approveId === trainee.id}
                    >
                      {approveId === trainee.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCheck className="h-4 w-4" />
                      )}
                      Approve
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatusTarget(trainee)}
                      className={trainee.status === "active" ? "text-destructive" : "text-primary"}
                    >
                      {trainee.status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      {trainee.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add trainee</DialogTitle>
            <DialogDescription>Register a new trainee in the programme.</DialogDescription>
          </DialogHeader>
          <TraineeForm
            mode="create"
            onSuccess={() => {
              setAddOpen(false);
              toast.success("Trainee added.");
            }}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTrainee} onOpenChange={(open) => !open && setEditTrainee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit trainee</DialogTitle>
            <DialogDescription>Update the trainee&apos;s details.</DialogDescription>
          </DialogHeader>
          {editTrainee ? (
            <TraineeForm
              mode="edit"
              trainee={editTrainee}
              onSuccess={() => {
                setEditTrainee(null);
                toast.success("Trainee updated.");
              }}
              onCancel={() => setEditTrainee(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTrainee} onOpenChange={(open) => !open && setViewTrainee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trainee details</DialogTitle>
            <DialogDescription>Full record for this trainee.</DialogDescription>
          </DialogHeader>
          {viewTrainee ? <TraineeDetails trainee={viewTrainee} /> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!statusTarget} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.status === "active" ? "Deactivate trainee?" : "Activate trainee?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.status === "active"
                ? `${statusTarget?.fullName} will no longer be considered active in the programme.`
                : `${statusTarget?.fullName} will be marked active again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => statusTarget && toggleStatus(statusTarget)}
              disabled={isPending}
              className={statusTarget?.status === "active" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {isPending ? "Saving..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
