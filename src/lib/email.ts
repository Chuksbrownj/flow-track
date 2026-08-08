async function sendEmail(to: string, subject: string, htmlContent: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY is not set — skipping email to", to);
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
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Failed to send email via Brevo:", response.status, body.slice(0, 300));
    return false;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail(
    to,
    "Reset your FlowTrack password",
    [
      "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">",
      "<h2 style=\"color: #0f172a;\">Reset your password</h2>",
      "<p style=\"color: #334155;\">We received a request to reset the password for your FlowTrack account.</p>",
      `<p><a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset password</a></p>`,
      "<p style=\"color: #64748b; font-size: 13px;\">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>",
      "</div>",
    ].join("")
  );
}

export async function sendAccountCredentialsEmail(
  to: string,
  name: string,
  loginEmail: string,
  password: string
) {
  return sendEmail(
    to,
    "Your FlowTrack staff account",
    [
      "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">",
      `<h2 style="color: #0f172a;">Welcome, ${escapeHtml(name)}!</h2>`,
      "<p style=\"color: #334155;\">A FlowTrack staff account has been created for you by the master admin.</p>",
      "<p style=\"color: #334155;\">Sign in at the staff portal with these details:</p>",
      "<table style=\"border-collapse: collapse; margin: 12px 0;\">",
      `<tr><td style="padding: 6px 12px; font-weight: 600; color: #0f172a;">Email</td><td style="padding: 6px 12px; color: #334155;">${escapeHtml(loginEmail)}</td></tr>`,
      `<tr><td style="padding: 6px 12px; font-weight: 600; color: #0f172a;">Password</td><td style="padding: 6px 12px; color: #334155;">${escapeHtml(password)}</td></tr>`,
      "</table>",
      "<p style=\"color: #64748b; font-size: 13px;\">We recommend changing your password after your first sign in.</p>",
      "</div>",
    ].join("")
  );
}
