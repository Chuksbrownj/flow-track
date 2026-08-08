import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = { ok: boolean; retryAfterSeconds?: number };

/**
 * Simple DB-backed sliding-window rate limiter. Persistent across serverless
 * instances because the counters live in the database.
 *
 * Uses a single atomic UPSERT so concurrent requests can neither double-insert
 * (unique-key 500) nor race the count increment past the limit.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();

  const [row] = await db()
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: new Date(now + windowMs) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`${rateLimits.count} + 1`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${new Date(now)} THEN ${new Date(now + windowMs)} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const { count, resetAt } = row ?? { count: 0, resetAt: new Date(now + windowMs) };
  if (count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  return { ok: true };
}

/** Client IP as seen by the platform (Vercel sets X-Forwarded-For). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
