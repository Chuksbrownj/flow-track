import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = { ok: boolean; retryAfterSeconds?: number };

/**
 * Chance that a rateLimit call also sweeps expired rows. Safety net for
 * deployments where the daily cron is not configured — the cron sweep in
 * `/api/cron/purge` remains the primary cleanup.
 */
const SWEEP_PROBABILITY = 0.01;

/**
 * Simple DB-backed sliding-window rate limiter. Persistent across serverless
 * instances because the counters live in the database.
 *
 * Uses a single atomic UPSERT so concurrent requests can neither double-insert
 * (unique-key 500) nor race the count increment past the limit. When the
 * window has expired the counter resets to 1 (a fresh window), so a user who
 * was locked out can log in again after the wait — the counter never grows
 * unboundedly.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  // Opportunistic hygiene: occasionally delete expired rows so the table stays
  // bounded even without the cron. Errors are swallowed — a failed sweep must
  // never break the rate-limit decision.
  if (Math.random() < SWEEP_PROBABILITY) {
    try {
      await purgeExpiredRateLimits();
    } catch (error) {
      console.error("rateLimit: expired-row sweep failed", error);
    }
  }

  const now = Date.now();

  const [row] = await db()
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: new Date(now + windowMs) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Expired window → start a fresh window (count 1); active window → increment.
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${new Date(now)} THEN 1 ELSE ${rateLimits.count} + 1 END`,
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

/**
 * Deletes rate-limit rows whose window has fully expired. Safe to run any
 * time — an expired key is simply re-created on its next use. Prevents the
 * table from accumulating one row per unique key forever.
 */
export async function purgeExpiredRateLimits(): Promise<number> {
  const deleted = await db()
    .delete(rateLimits)
    .where(lt(rateLimits.resetAt, new Date()))
    .returning({ key: rateLimits.key });
  return deleted.length;
}

/** Client IP as seen by the platform (Vercel sets X-Forwarded-For). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
