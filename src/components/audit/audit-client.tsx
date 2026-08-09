"use client";

import { useMemo, useState } from "react";
import { ScrollText, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/date";
import { describeAudit, roleLabel, type AuditLogRow } from "@/lib/audit";

const ENTITY_LABELS: Record<string, string> = {
  all: "All actions",
  trainee: "Trainees",
  attendance: "Attendance",
  score_sheet: "Score sheet",
  schedule: "Schedule",
  staff: "Staff",
  exam: "Exams",
  profile: "Student profiles",
  auth: "Accounts",
};

function RoleChip({ role }: { role: string | null }) {
  if (!role) return null;
  const isStaff = role === "master_admin" || role === "admin";
  return (
    <Badge variant="outline" className={isStaff ? "gap-1 border-primary/30 bg-primary/5" : "gap-1"}>
      {isStaff ? <ShieldCheck className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
      {roleLabel(role)}
    </Badge>
  );
}

export function AuditClient({ logs, isMaster }: { logs: AuditLogRow[]; isMaster: boolean }) {
  const [entity, setEntity] = useState("all");

  const filtered = useMemo(
    () => (entity === "all" ? logs : logs.filter((row) => row.entityType === entity)),
    [logs, entity]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            {isMaster
              ? "Every data-changing action across the system, newest first."
              : "Data-changing actions by and on students."}
          </p>
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by area">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Recent activity
          </CardTitle>
          <CardDescription>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No activity recorded yet.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{describeAudit(log)}</p>
                      <RoleChip role={log.actorRole} />
                    </div>
                    <p className="text-sm text-muted-foreground">{log.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      by {log.actorName ?? "Unknown user"}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-right">
                    {formatDateTime(log.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
