"use server";

import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportTickets, users } from "@/db/schema";
import { isValidEmail } from "@/lib/validation";
import { sendSupportTicketConfirmation } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth-guard";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type ActionResult = { ok: boolean; error?: string; message?: string };

export type SupportResult = { ok: boolean; error?: string; ticketNumber?: string };

export type SupportTicketRow = {
  id: string;
  ticketNumber: string;
  name: string;
  email: string;
  phone: string | null;
  registrationNumber: string | null;
  description: string;
  status: string;
  handledById: string | null;
  handledByName: string | null;
  handledAt: string | null;
  adminNote: string | null;
  createdAt: string;
};

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
 * ticket number to the submitter. Tickets are handled from the staff Support
 * page — no admin email notification is sent.
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

  if (!confirmed) {
    return {
      ok: true,
      ticketNumber,
      error: "Ticket created, but the confirmation email could not be sent. Note your ticket number.",
    };
  }
  return { ok: true, ticketNumber };
}

/** Number of unresolved tickets — shown as a badge in the staff sidebar. */
export async function countOpenSupportTickets(): Promise<number> {
  await requireStaff();
  const [row] = await db()
    .select({ value: count() })
    .from(supportTickets)
    .where(eq(supportTickets.status, "open"));
  return row?.value ?? 0;
}

/** All support tickets, newest first, with the name of the admin who handled them. */
export async function listSupportTickets(): Promise<SupportTicketRow[]> {
  await requireStaff();
  const rows = await db()
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      name: supportTickets.name,
      email: supportTickets.email,
      phone: supportTickets.phone,
      registrationNumber: supportTickets.registrationNumber,
      description: supportTickets.description,
      status: supportTickets.status,
      handledById: supportTickets.handledById,
      handledByName: users.name,
      handledAt: supportTickets.handledAt,
      adminNote: supportTickets.adminNote,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.handledById))
    .orderBy(desc(supportTickets.createdAt));

  return rows.map((row) => ({
    ...row,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Marks a ticket as resolved, recording who handled it and an optional note. */
export async function resolveSupportTicket(ticketId: string, note: string): Promise<ActionResult> {
  const user = await requireStaff();
  const adminNote = note.trim().slice(0, 500);

  try {
    const [ticket] = await db()
      .select({ ticketNumber: supportTickets.ticketNumber })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) return { ok: false, error: "Ticket not found." };

    await db()
      .update(supportTickets)
      .set({
        status: "resolved",
        handledById: user.id,
        handledAt: new Date(),
        adminNote: adminNote || null,
      })
      .where(eq(supportTickets.id, ticketId));

    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: "ticket_resolved",
      entityType: "support",
      entityId: ticketId,
      summary: `Resolved support ticket ${ticket.ticketNumber}`,
    });
    return { ok: true, message: "Ticket marked as resolved." };
  } catch (error) {
    console.error("resolveSupportTicket:", error);
    return { ok: false, error: "Could not resolve the ticket. Try again." };
  }
}

/** Reopens a resolved ticket so it shows up in the open queue again. */
export async function reopenSupportTicket(ticketId: string): Promise<ActionResult> {
  const user = await requireStaff();

  try {
    const [ticket] = await db()
      .select({ ticketNumber: supportTickets.ticketNumber })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) return { ok: false, error: "Ticket not found." };

    await db()
      .update(supportTickets)
      .set({ status: "open", handledById: null, handledAt: null, adminNote: null })
      .where(eq(supportTickets.id, ticketId));

    await recordAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: "ticket_reopened",
      entityType: "support",
      entityId: ticketId,
      summary: `Reopened support ticket ${ticket.ticketNumber}`,
    });
    return { ok: true, message: "Ticket reopened." };
  } catch (error) {
    console.error("reopenSupportTicket:", error);
    return { ok: false, error: "Could not reopen the ticket. Try again." };
  }
}
