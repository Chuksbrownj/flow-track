import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY ?? "missing");

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === "missing") {
    console.warn("RESEND_API_KEY is not set — skipping password reset email to", to);
    return false;
  }
  const from = process.env.RESEND_FROM ?? "FlowTrack <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Reset your FlowTrack password",
    html: [
      "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">",
      "<h2 style=\"color: #0f172a;\">Reset your password</h2>",
      "<p style=\"color: #334155;\">We received a request to reset the password for your FlowTrack account.</p>",
      `<p><a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset password</a></p>`,
      "<p style=\"color: #64748b; font-size: 13px;\">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>",
      "</div>",
    ].join(""),
  });
  if (error) {
    console.error("Failed to send password reset email:", error);
    return false;
  }
  return true;
}
