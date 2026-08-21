"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Hash,
  Inbox,
  LifeBuoy,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/date";
import {
  reopenSupportTicket,
  resolveSupportTicket,
  type SupportTicketRow,
} from "@/lib/actions/support";

function StatusBadge({ status }: { status: string }) {
  if (status === "open") {
    return (
      <Badge className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Open
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="h-3 w-3 text-primary" />
      Resolved
    </Badge>
  );
}

function ContactChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span className="sr-only">{label}</span>
      {value}
    </span>
  );
}

export function SupportClient({ tickets }: { tickets: SupportTicketRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState("open");
  const [query, setQuery] = useState("");
  const [resolveTarget, setResolveTarget] = useState<SupportTicketRow | null>(null);
  const [pending, startTransition] = useTransition();

  const openCount = useMemo(() => tickets.filter((t) => t.status === "open").length, [tickets]);
  const resolvedCount = tickets.length - openCount;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchesTab = tab === "open" ? t.status === "open" : t.status === "resolved";
      if (!matchesTab) return false;
      if (!needle) return true;
      return [t.ticketNumber, t.name, t.email, t.phone ?? "", t.registrationNumber ?? "", t.description]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [tickets, tab, query]);

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, onOk?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
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
          <h1 className="text-2xl font-semibold text-on-surface">Support tickets</h1>
          <p className="text-sm text-muted-foreground">
            Requests from the public &ldquo;Contact Admin&rdquo; form, handled here by any admin.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tickets…"
            className="pl-8"
            aria-label="Search tickets"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">
            Open
            {openCount > 0 ? (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {openCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved
            {resolvedCount > 0 ? (
              <span className="ml-1 rounded-full bg-muted-foreground/15 px-1.5 text-xs font-semibold text-muted-foreground">
                {resolvedCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  {tickets.length === 0
                    ? "No tickets yet."
                    : query
                      ? "No tickets match your search."
                      : tab === "open"
                        ? "All caught up — no open tickets."
                        : "No resolved tickets yet."}
                </p>
                <p className="text-xs text-muted-foreground">
                  New submissions from the contact form will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((ticket) => (
                <Card key={ticket.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">
                          <span className="font-mono text-primary">{ticket.ticketNumber}</span>
                        </CardTitle>
                        <StatusBadge status={ticket.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(ticket.createdAt)}
                      </p>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-1.5">
                      <ContactChip icon={Mail} label="Email" value={ticket.email} />
                      <ContactChip icon={Phone} label="Phone" value={ticket.phone} />
                      <ContactChip icon={Hash} label="Registration" value={ticket.registrationNumber} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{ticket.name}</p>
                      <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                        {ticket.description}
                      </p>
                    </div>

                    {ticket.status === "open" ? (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setResolveTarget(ticket)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark resolved
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Resolved by <span className="font-medium">{ticket.handledByName ?? "an admin"}</span>
                          {" · "}
                          {formatDateTime(ticket.handledAt)}
                          {ticket.adminNote ? (
                            <span className="mt-1 block italic">&ldquo;{ticket.adminNote}&rdquo;</span>
                          ) : null}
                        </p>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-1.5">
                              <RotateCcw className="h-4 w-4" />
                              Reopen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reopen {ticket.ticketNumber}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The ticket moves back to the open queue so another admin can pick it up.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  run(() => reopenSupportTicket(ticket.id), () => router.refresh())
                                }
                              >
                                Reopen ticket
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={resolveTarget !== null} onOpenChange={(open) => !open && setResolveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {resolveTarget ? (
            <ResolveTicketForm
              key={resolveTarget.id}
              ticket={resolveTarget}
              pending={pending}
              onSubmit={(note) =>
                run(() => resolveSupportTicket(resolveTarget.id, note), () => {
                  setResolveTarget(null);
                  router.refresh();
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResolveTicketForm({
  ticket,
  pending,
  onSubmit,
}: {
  ticket: SupportTicketRow;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit(String(formData.get("note") ?? "").trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-primary" />
          Resolve {ticket.ticketNumber}
        </DialogTitle>
        <DialogDescription>
          Optionally note how this ticket was handled. The note is visible to the other admins on
          this page.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="resolve-note">Resolution note (optional)</Label>
        <Textarea
          id="resolve-note"
          name="note"
          placeholder="e.g. Called the trainee back — password reset sent."
          rows={4}
          maxLength={500}
        />
      </div>
      <DialogFooter showCloseButton={false}>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {pending ? "Resolving..." : "Mark as resolved"}
        </Button>
      </DialogFooter>
    </form>
  );
}
