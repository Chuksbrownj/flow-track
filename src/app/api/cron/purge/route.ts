import { NextResponse } from "next/server";
import { purgeDeletedTrainees } from "@/lib/actions/trainees";

/**
 * Daily maintenance job — see `vercel.json` (crons).
 *
 * Purges trainee records that were marked for deletion more than 1 week ago,
 * so deleted records are removed even when nobody opens the app. Attendance,
 * scores and submissions cascade off the trainee row automatically.
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every cron
 * request. The endpoint refuses to run unless that header matches, so it can
 * never be triggered by a random visitor. If CRON_SECRET is not configured,
 * the job stays locked (rejects) rather than running unauthenticated.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const purged = await purgeDeletedTrainees();
    return NextResponse.json({ ok: true, purged });
  } catch (error) {
    console.error("Cron purge failed:", error);
    return NextResponse.json({ ok: false, error: "Purge failed." }, { status: 500 });
  }
}
