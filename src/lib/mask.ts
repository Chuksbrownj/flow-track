export function maskEmail(email: string | null): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  const tld = domain.split(".").pop() ?? "";
  const localMasked = local.length <= 2 ? `${local[0]}***` : `${local.slice(0, 2)}***`;
  const domainMasked = domain.length <= 1 ? "***" : `${domain[0]}***`;
  return `${localMasked}@${domainMasked}.${tld}`;
}

export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length <= 6) return `${digits[0] ?? ""}***${digits.slice(-2)}`;
  return `${digits.slice(0, 4)}*****${digits.slice(-2)}`;
}
