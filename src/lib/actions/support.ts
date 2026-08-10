"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportTickets, users } from "@/db/schema";
import { isValidEmail } from "@/lib/validation";
import { sendSupportTicketConfirmation, sendSupportTicketNotice } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type SupportResult = { ok: boolean; error?: string; ticketNumber?: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function randomTicketNumber(): string {
  // e.g. "FT-3K9QX7" — readable, unlikely to collide.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `FT-${code}`;
}

const SUPPORT_IP_LIMIT = 5; // tickets per IP per hour
const SUPPORT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Creates a support ticket from the public "Contact Admin" form and emails the
 * ticket number to the submitter, with the details routed to the admin team.
 */
export async function submitSupportTicket(formData: FormData): Promise<SupportResult> {
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const registrationNumber = value(formData, "registrationNumber");
  const description = value(formData, "description");

  if (name.length < 3) return { ok: false, error: "Please enter your full name." };
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };
  if (description.length < 10) {
    return { ok: false, error: "Please describe the issue (at least 10 characters)." };
  }

  const ip = await clientIp();
  const limited = await rateLimit(`support:ip:${ip}`, SUPPORT_IP_LIMIT, SUPPORT_WINDOW_MS);
  if (!limited.ok) {
    return { ok: false, error: "Too many requests. Please wait a while and try again." };
  }

  let ticketNumber = randomTicketNumber();
  try {
    // Retry on the (unlikely) unique-index collision.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db().insert(supportTickets).values({
          ticketNumber,
          name,
          email,
          phone: phone || null,
          registrationNumber: registrationNumber || null,
          description,
        });
        break;
      } catch {
        ticketNumber = randomTicketNumber();
        if (attempt === 2) throw new Error("ticket number collision");
      }
    }
  } catch {
    return { ok: false, error: "Could not create the ticket. Try again." };
  }

  // Email the ticket number to the submitter.
  const confirmed = await sendSupportTicketConfirmation(email, ticketNumber, name);

  // Route the details to the admin team (master admin emails, or env override).
  let admins: string[] = [];
  const override = process.env.SUPPORT_EMAIL;
  if (override) {
    admins = [override];
  } else {
    const rows = await db()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, "master_admin"));
    admins = rows
      .map((row) => row.email)
      .filter((emailValue): emailValue is string => !!emailValue);
  }
  if (admins.length > 0) {
    await sendSupportTicketNotice(admins, {
      ticketNumber,
      name,
      email,
      phone,
      registrationNumber,
      description,
    });
  }

  if (!confirmed) {
    return {
      ok: true,
      ticketNumber,
      error: "Ticket created, but the confirmation email could not be sent. Note your ticket number.",
    };
  }
  return { ok: true, ticketNumber };
}
