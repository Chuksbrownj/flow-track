export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Trainee self check-in stays open until this hour (18:00 GMT/UTC). */
export const CHECKIN_CUTOFF_HOUR = 18;

/** True while trainees can still self check-in for today (before 18:00 GMT). */
export function isCheckinOpen(date = new Date()) {
  return date.getUTCHours() < CHECKIN_CUTOFF_HOUR;
}

/**
 * Whether a trainer can still mark/change attendance for a given day.
 * Records stay editable for 72 hours after the day ends.
 */
export function attendanceEditable(dateStr: string, now = new Date()) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const endOfDay = Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1);
  return now.getTime() <= endOfDay + 72 * 60 * 60 * 1000;
}

export function daysAgoStr(days: number) {
  return todayStr(new Date(Date.now() - days * 86400000));
}

export function currentMonth(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, (m ?? 1), 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${y}-${pad(m ?? 1)}-01`, end: `${y}-${pad(m ?? 1)}-${pad(last)}` };
}

function parseIso(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  }
  return new Date(value);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDay(iso: string | null | undefined) {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" });
}

export function formatMonth(iso: string | null | undefined) {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

export function formatTime(t: string | null | undefined) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
