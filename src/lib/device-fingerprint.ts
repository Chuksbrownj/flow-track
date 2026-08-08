"use client";

const STORAGE_KEY = "flowtrack_device_salt";

function collectSignals(): string[] {
  if (typeof window === "undefined") return [];
  return [
    navigator.userAgent,
    navigator.platform ?? "",
    navigator.language ?? "",
    String(screen.width ?? ""),
    String(screen.height ?? ""),
    String(screen.colorDepth ?? ""),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(navigator.hardwareConcurrency ?? ""),
    typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0 ? "touch" : "notouch",
  ];
}

function getOrCreateSalt(): string {
  if (typeof window === "undefined") return "";
  let salt = window.localStorage.getItem(STORAGE_KEY);
  if (!salt) {
    salt = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, salt);
  }
  return salt;
}

/**
 * Produces a stable 64-char fingerprint for the current device.
 * The fingerprint is a hash of browser/hardware signals plus a persisted
 * random salt, so it stays the same across sessions on one device but is
 * effectively unique per device/browser profile.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const source = [...collectSignals(), getOrCreateSalt()].join("|");
  const data = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
