import { asc, eq, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { StaffClient } from "@/components/staff/staff-client";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const admin = await requireAdmin();

  const rows = await db()
    .select()
    .from(users)
    .where(or(eq(users.role, "admin"), eq(users.role, "trainer")))
    .orderBy(asc(users.role), asc(users.name));

  return (
    <StaffClient
      currentUserId={admin.id ?? ""}
      staff={rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        topic: row.topic,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
