"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  CheckCheck,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app/status-badge";
import {
  approveTrainee,
  confirmSuspendRequest,
  markTraineeDeleted,
  rejectSuspendRequest,
  requestSuspendTrainee,
  restoreTrainee,
  suspendTrainee,
} from "@/lib/actions/trainees";
import { describeTraineeChange, type TraineeLogRow } from "@/lib/trainee-logs";
import { formatDate, formatDateTime } from "@/lib/date";
import { TraineeDetails } from "./trainee-details";
import { TraineeForm, type TraineeRow } from "./trainee-form";

export type SuspendRequestRow = {
  id: string;
  traineeId: string;
  reason: string;
  createdAt: string;
};

const ITEMS_PER_PAGE = 10;

export function TraineesClient({
  initialTrainees,
  isMaster,
  changeLogs,
  suspendRequests,
}: {
  initialTrainees: TraineeRow[];
  isMaster: boolean;
  changeLogs: TraineeLogRow[];
  suspendRequests: SuspendRequestRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editTrainee, setEditTrainee] = useState<TraineeRow | null>(null);
  const [viewTrainee, setViewTrainee] = useState<TraineeRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<TraineeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TraineeRow | null>(null);
  const [requestTarget, setRequestTarget] = useState<TraineeRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const traineeById = useMemo(
    () => new Map(initialTrainees.map((trainee) => [trainee.id, trainee])),
    [initialTrainees]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialTrainees.filter((trainee) => {
      const matchesStatus = statusFilter === "all" || trainee.status === statusFilter;
      const matchesGender = genderFilter === "all" || trainee.gender?.toLowerCase() === genderFilter;
      const matchesQuery =
        !q ||
        trainee.fullName.toLowerCase().includes(q) ||
        (trainee.registrationNumber?.toLowerCase().includes(q) ?? false);
      return matchesStatus && matchesGender && matchesQuery;
    });
  }, [initialTrainees, query, statusFilter, genderFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedTrainees = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const router = useRouter();

  function handleApprove(trainee: TraineeRow) {
    setApproveId(trainee.id);
    startTransition(async () => {
      const result = await approveTrainee(trainee.id);
      setApproveId(null);
      if (result.ok) {
        toast.success(`${trainee.fullName} approved.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleSuspend(trainee: TraineeRow) {
    startTransition(async () => {
      const result = await suspendTrainee(trainee.id);
      if (result.ok) {
        toast.success(result.message ?? "Account suspended.");
        setSuspendTarget(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleRestore(trainee: TraineeRow) {
    startTransition(async () => {
      const result = await restoreTrainee(trainee.id);
      if (result.ok) {
        toast.success(result.message ?? "Account restored.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleDelete(trainee: TraineeRow) {
    startTransition(async () => {
      const result = await markTraineeDeleted(trainee.id);
      if (result.ok) {
        toast.success(result.message ?? "Account marked for deletion.");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleSuspendRequest(trainee: TraineeRow) {
    startTransition(async () => {
      const result = await requestSuspendTrainee(trainee.id, suspendReason);
      if (result.ok) {
        toast.success(result.message ?? "Suspension requested.");
        setRequestTarget(null);
        setSuspendReason("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function decideSuspendRequest(requestId: string, confirm: boolean) {
    startTransition(async () => {
      const result = confirm
        ? await confirmSuspendRequest(requestId)
        : await rejectSuspendRequest(requestId);
      if (result.ok) {
        toast.success(result.message ?? (confirm ? "Request confirmed." : "Request rejected."));
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const pendingCount = suspendRequests.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold font-heading text-primary">Trainees</h1>
      </div>

      {isMaster && pendingCount > 0 ? (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-gold-foreground">
            <ShieldCheck className="h-4 w-4" />
            {pendingCount} pending suspension request{pendingCount === 1 ? "" : "s"}
          </p>
          <ul className="mt-3 space-y-2">
            {suspendRequests.map((request) => {
              const trainee = traineeById.get(request.traineeId);
              return (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {trainee?.fullName ?? "Unknown trainee"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatDateTime(request.createdAt)} · {request.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive"
                      disabled={isPending}
                      onClick={() => decideSuspendRequest(request.id, false)}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={isPending}
                      onClick={() => decideSuspendRequest(request.id, true)}
                    >
                      <Ban className="h-4 w-4" />
                      Confirm suspension
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search trainees..."
            className="pl-9"
            aria-label="Search trainees"
          />
        </div>
        <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by gender">
            <SelectValue placeholder="All Genders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="dormant">Dormant</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Create Trainee
        </Button>
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
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Reg Number</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Gender</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrainees.map((trainee) => (
                  <tr key={trainee.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">{trainee.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{trainee.fullName}</td>
                    <td className="px-4 py-3 text-sm">{trainee.gender}</td>
                    <td className="px-4 py-3 text-sm">{trainee.phone}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{trainee.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={trainee.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewTrainee(trainee)} aria-label="View details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isMaster ? (
                          <Button variant="ghost" size="icon" onClick={() => setEditTrainee(trainee)} aria-label="Edit trainee">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
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
                        ) : null}
                        {isMaster ? (
                          trainee.status === "dormant" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-primary"
                              onClick={() => handleRestore(trainee)}
                              aria-label="Restore trainee"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-gold-foreground"
                                onClick={() => setSuspendTarget(trainee)}
                                aria-label="Suspend trainee"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => setDeleteTarget(trainee)}
                                aria-label="Delete trainee"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )
                        ) : trainee.status !== "pending" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gold-foreground"
                            onClick={() => setRequestTarget(trainee)}
                            aria-label="Request suspension"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {paginatedTrainees.map((trainee) => (
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
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setViewTrainee(trainee)}>
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  {isMaster ? (
                    <Button variant="outline" size="sm" onClick={() => setEditTrainee(trainee)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  ) : null}
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
                  ) : null}
                  {isMaster ? (
                    trainee.status === "dormant" ? (
                      <Button variant="outline" size="sm" className="text-primary" onClick={() => handleRestore(trainee)}>
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-gold-foreground"
                          onClick={() => setSuspendTarget(trainee)}
                        >
                          <Ban className="h-4 w-4" />
                          Suspend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(trainee)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </>
                    )
                  ) : trainee.status !== "pending" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gold-foreground"
                      onClick={() => setRequestTarget(trainee)}
                    >
                      <Ban className="h-4 w-4" />
                      Request suspension
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  const page = currentPage <= 2 ? i + 1 : currentPage + i - 1;
                  if (page > totalPages) return null;
                  return (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className={page === currentPage ? "bg-primary text-primary-foreground" : ""}
                    >
                      {page}
                    </Button>
                  );
                })}
                {totalPages > 3 && <span className="text-muted-foreground">...</span>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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
              router.refresh();
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
              router.refresh();
            }}
            onCancel={() => setEditTrainee(null)}
          />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change history</DialogTitle>
            <DialogDescription>
              Changes made to trainees&apos; details. Entries are kept for 5 days and then cleared
              automatically.
            </DialogDescription>
          </DialogHeader>
          {changeLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No changes recorded yet.
            </div>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {changeLogs.map((log) => (
                <li key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {log.traineeName}
                      {log.registrationNumber ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {log.registrationNumber}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{describeTraineeChange(log)}</p>
                  </div>
                  <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                    <p>{formatDateTime(log.createdAt)}</p>
                    {log.actorName ? <p>by {log.actorName}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTrainee} onOpenChange={(open) => !open && setViewTrainee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trainee details</DialogTitle>
            <DialogDescription>Full record for this trainee.</DialogDescription>
          </DialogHeader>
          {viewTrainee ? (
            <TraineeDetails trainee={viewTrainee} isMaster={isMaster} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={requestTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRequestTarget(null);
            setSuspendReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-primary" />
              Request suspension
            </DialogTitle>
            <DialogDescription>
              {requestTarget?.fullName}&apos;s account stays active until a master admin confirms
              this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              value={suspendReason}
              onChange={(event) => setSuspendReason(event.target.value)}
              placeholder="Why should this account be suspended?"
              minLength={5}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={isPending || suspendReason.trim().length < 5}
              onClick={() => requestTarget && handleSuspendRequest(requestTarget)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Submit request
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {suspendTarget?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account becomes dormant immediately and the trainee can no longer sign in. You can
              restore it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => suspendTarget && handleSuspend(suspendTarget)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Suspend account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleteTarget?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account is immediately marked for deletion — the trainee can no longer sign in. All
              personal and performance data is purged from the database after 1 week. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Mark for deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
