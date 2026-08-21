export type ActionResult = { ok: boolean; error?: string; message?: string };

export function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
