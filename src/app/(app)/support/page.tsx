import { requireStaff } from "@/lib/auth-guard";
import { listSupportTickets } from "@/lib/actions/support";
import { SupportClient } from "@/components/support/support-client";

export const metadata = { title: "Support tickets" };

export default async function SupportPage() {
  await requireStaff();
  const tickets = await listSupportTickets();

  return <SupportClient tickets={tickets} />;
}
