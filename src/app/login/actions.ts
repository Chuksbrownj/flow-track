"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { clientIp, rateLimit, type RateLimitResult } from "@/lib/rate-limit";

const LOGIN_EMAIL_LIMIT = 10; // per email per window
const LOGIN_IP_LIMIT = 30; // per IP per window
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await clientIp();

  const [byEmail, byIp] = await Promise.all<RateLimitResult>([
    email
      ? rateLimit(`login:email:${email}`, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_MS)
      : { ok: true },
    rateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS),
  ]);

  if (!byEmail.ok || !byIp.ok) {
    const limited = !byEmail.ok ? byEmail : byIp;
    return `Too many sign-in attempts. Try again in ${Math.ceil((limited.retryAfterSeconds ?? 60) / 60)} minute(s).`;
  }

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    throw error;
  }
}
