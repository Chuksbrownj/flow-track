"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContactDetails } from "@/lib/actions/profile";

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
  const [emailState, setEmailState] = useState<RevealState>("idle");
  const [phoneState, setPhoneState] = useState<RevealState>("idle");
  const [details, setDetails] = useState<{ email: string | null; phone: string | null } | null>(null);

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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Full name</p>
        <p className="text-sm font-medium">{fullName}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Registration number
        </p>
        <p className="text-sm font-medium">{registrationNumber ?? "—"}</p>
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
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Email and phone are hidden by default. Use the eye icon to reveal them.
      </p>
    </div>
  );
}
