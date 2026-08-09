"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getContactDetails, updateContactDetails } from "@/lib/actions/profile";

type RevealState = "idle" | "loading" | "revealed";

function RevealField({
  label,
  masked,
  revealedValue,
  state,
  onReveal,
}: {
  label: string;
  masked: string;
  revealedValue: string | null;
  state: RevealState;
  onReveal: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="break-all text-sm font-medium tabular-nums">
          {state === "revealed" ? (revealedValue || "—") : masked}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 px-0"
          aria-label={
            state === "revealed" ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`
          }
          onClick={onReveal}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : state === "revealed" ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function ProfileView({
  fullName,
  registrationNumber,
  gender,
  joined,
  maskedEmail,
  maskedPhone,
}: {
  fullName: string;
  registrationNumber: string | null;
  gender: string;
  joined: string;
  maskedEmail: string;
  maskedPhone: string;
}) {
  const router = useRouter();
  const [emailState, setEmailState] = useState<RevealState>("idle");
  const [phoneState, setPhoneState] = useState<RevealState>("idle");
  const [details, setDetails] = useState<{ email: string | null; phone: string | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function reveal(field: "email" | "phone") {
    const target = field === "email" ? setEmailState : setPhoneState;
    target("loading");
    try {
      const result = details ?? (await getContactDetails());
      setDetails(result);
      target("revealed");
    } catch {
      target("idle");
    }
  }

  // Preload contact details so the edit dialog opens with current values.
  useEffect(() => {
    let active = true;
    getContactDetails()
      .then((result) => {
        if (active) {
          setDetails(result);
          setEditEmail(result.email ?? "");
          setEditPhone(result.phone ?? "");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateContactDetails({ email: editEmail, phone: editPhone });
      if (result.ok) {
        setDetails({ email: editEmail.trim().toLowerCase() || null, phone: editPhone.trim() });
        setEditOpen(false);
        toast.success("Contact details updated.");
        router.refresh();
      } else {
        setError(result.error ?? "Could not save your details.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full name</p>
          <p className="text-sm font-medium">{fullName}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Registration code
          </p>
          <p className="text-sm font-medium">{registrationNumber ?? "—"}</p>
          <p className="text-xs text-muted-foreground">Locked — contact a trainer to change it.</p>
        </div>
        <RevealField
          label="Email"
          masked={maskedEmail}
          revealedValue={details?.email ?? null}
          state={emailState}
          onReveal={() => reveal("email")}
        />
        <RevealField
          label="Phone"
          masked={maskedPhone}
          revealedValue={details?.phone ?? null}
          state={phoneState}
          onReveal={() => reveal("phone")}
        />
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gender</p>
          <p className="text-sm font-medium">{gender}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Joined</p>
          <p className="text-sm font-medium">{joined}</p>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Pencil className="h-4 w-4" />
            Edit contact details
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit contact details</DialogTitle>
            <DialogDescription>
              Update your email and phone number. Your registration code and name cannot be changed.
              Your email is used to reset your password if you forget it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
                placeholder="e.g. 08012345678"
                required
                minLength={7}
                maxLength={20}
              />
            </div>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter showCloseButton={false}>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isPending ? "Saving..." : "Save details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
