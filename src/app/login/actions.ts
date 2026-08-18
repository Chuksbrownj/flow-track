"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import {
  checkRateLimit,
  clientIp,
  recordRateLimitFailure,
  type RateLimitResult,
} from "@/lib/rate-limit";

// Only FAILED attempts count toward the limits, so successful logins never
// consume the quota — important on shared campus networks where many students
// sign in from the same IP.
const LOGIN_IDENTIFIER_LIMIT = 10; // failed attempts per identifier per window
const LOGIN_IP_LIMIT = 60; // failed attempts per IP per window
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const ip = await clientIp();

  // Gate on the current failure count — this attempt is not counted yet.
  const [byIdentifier, byIp] = await Promise.all<RateLimitResult>([
    identifier
      ? checkRateLimit(`login:identifier:${identifier}`, LOGIN_IDENTIFIER_LIMIT)
      : { ok: true },
    checkRateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT),
  ]);

  if (!byIdentifier.ok || !byIp.ok) {
    const limited = !byIdentifier.ok ? byIdentifier : byIp;
    return `Too many sign-in attempts. Try again in ${Math.ceil((limited.retryAfterSeconds ?? 60) / 60)} minute(s).`;
  }

  try {
    await signIn("credentials", {
      identifier: String(formData.get("identifier") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Count the failure after the fact; a successful sign-in never records.
      await Promise.all([
        identifier
          ? recordRateLimitFailure(`login:identifier:${identifier}`, LOGIN_WINDOW_MS)
          : Promise.resolve(),
        recordRateLimitFailure(`login:ip:${ip}`, LOGIN_WINDOW_MS),
      ]);
      return "Invalid email/registration code or password.";
    }
    throw error;
  }
}
