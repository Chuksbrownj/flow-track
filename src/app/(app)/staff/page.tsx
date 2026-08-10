import { asc, eq, or } from "drizzle-orm";
import { requireMasterAdmin } from "@/lib/auth-guard";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { StaffClient } from "@/components/staff/staff-client";
import { listCourses } from "@/lib/courses";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const admin = await requireMasterAdmin();

  const [rows, courseRows] = await Promise.all([
    db()
      .select()
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "master_admin")))
      .orderBy(asc(users.role), asc(users.name)),
    listCourses(),
  ]);

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
      courses={courseRows.map((course) => course.name)}
    />
  );
}
