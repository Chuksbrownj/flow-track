import { requireStaff } from "@/lib/auth-guard";
import { listAuditLogs } from "@/lib/audit";
import { AuditClient } from "@/components/audit/audit-client";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const user = await requireStaff();
  const logs = await listAuditLogs({ role: user.role });
  const isMaster = user.role === "master_admin";

  return <AuditClient logs={logs} isMaster={isMaster} />;
}
