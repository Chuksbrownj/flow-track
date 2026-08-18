"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { isUuid } from "@/lib/validation";

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function listNotifications(limit = 30): Promise<NotificationRow[]> {
  const user = await requireUser();
  const rows = await db()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id ?? ""))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnreadNotifications(): Promise<number> {
  const user = await requireUser();
  const [row] = await db()
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id ?? ""), eq(notifications.read, false)));
  return row?.value ?? 0;
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!isUuid(id)) return { ok: false };
  await db()
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id ?? "")));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db()
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.userId, user.id ?? ""));
  revalidatePath("/notifications");
  return { ok: true };
}
