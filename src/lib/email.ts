export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY is not set — skipping password reset email to", to);
    return false;
  }

  const fromEmail = process.env.BREVO_FROM_EMAIL ?? "onboarding@brevo.com";
  const fromName = process.env.BREVO_FROM_NAME ?? "FlowTrack";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject: "Reset your FlowTrack password",
      htmlContent: [
        "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">",
        "<h2 style=\"color: #0f172a;\">Reset your password</h2>",
        "<p style=\"color: #334155;\">We received a request to reset the password for your FlowTrack account.</p>",
        `<p><a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset password</a></p>`,
        "<p style=\"color: #64748b; font-size: 13px;\">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>",
        "</div>",
      ].join(""),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Failed to send password reset email via Brevo:", response.status, body.slice(0, 300));
    return false;
  }
  return true;
}
