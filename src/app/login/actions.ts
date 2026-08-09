"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { clientIp, rateLimit, type RateLimitResult } from "@/lib/rate-limit";

const LOGIN_IDENTIFIER_LIMIT = 10; // per identifier per window
const LOGIN_IP_LIMIT = 30; // per IP per window
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const ip = await clientIp();

  const [byIdentifier, byIp] = await Promise.all<RateLimitResult>([
    identifier
      ? rateLimit(`login:identifier:${identifier}`, LOGIN_IDENTIFIER_LIMIT, LOGIN_WINDOW_MS)
      : { ok: true },
    rateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS),
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
      return "Invalid email/registration code or password.";
    }
    throw error;
  }
}
