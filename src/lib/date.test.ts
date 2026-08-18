import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attendanceEditable,
  currentMonth,
  daysAgoStr,
  formatDate,
  formatDateTime,
  formatDay,
  formatLongDate,
  formatMonth,
  formatTime,
  formatWeek,
  isCheckinOpen,
  isTodayTrainingDay,
  isTrainingDay,
  monthRange,
  todayStr,
  weekKey,
} from "@/lib/date";

afterEach(() => {
  vi.useRealTimers();
});

/** Pins "now" to a local-time 2026-08-18 12:00 so date strings are zone-independent. */
function freezeClock() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 18, 12, 0, 0));
}

describe("todayStr", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayStr(new Date(2026, 7, 18))).toBe("2026-08-18");
    expect(todayStr(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("returns today when called without an argument", () => {
    freezeClock();
    expect(todayStr()).toBe("2026-08-18");
  });
});

describe("isCheckinOpen", () => {
  it("is open before 18:00 UTC", () => {
    expect(isCheckinOpen(new Date("2026-08-17T00:00:00Z"))).toBe(true);
    expect(isCheckinOpen(new Date("2026-08-17T17:59:59Z"))).toBe(true);
  });

  it("is closed at and after 18:00 UTC", () => {
    expect(isCheckinOpen(new Date("2026-08-17T18:00:00Z"))).toBe(false);
    expect(isCheckinOpen(new Date("2026-08-17T23:59:59Z"))).toBe(false);
  });
});

describe("isTrainingDay", () => {
  it("accepts Mon/Wed/Fri (2026-08-17..23 = Mon..Sun)", () => {
    expect(isTrainingDay("2026-08-17")).toBe(true); // Monday
    expect(isTrainingDay("2026-08-19")).toBe(true); // Wednesday
    expect(isTrainingDay("2026-08-21")).toBe(true); // Friday
  });

  it("rejects Tue/Thu/Sat/Sun", () => {
    expect(isTrainingDay("2026-08-18")).toBe(false); // Tuesday
    expect(isTrainingDay("2026-08-20")).toBe(false); // Thursday
    expect(isTrainingDay("2026-08-22")).toBe(false); // Saturday
    expect(isTrainingDay("2026-08-23")).toBe(false); // Sunday
  });

  it("accepts Date objects too", () => {
    expect(isTrainingDay(new Date("2026-08-17T00:00:00.000Z"))).toBe(true);
    expect(isTrainingDay(new Date("2026-08-18T00:00:00.000Z"))).toBe(false);
  });
});

describe("isTodayTrainingDay", () => {
  it("depends on the given instant's weekday", () => {
    expect(isTodayTrainingDay(new Date("2026-08-19T10:00:00Z"))).toBe(true);
    expect(isTodayTrainingDay(new Date("2026-08-18T10:00:00Z"))).toBe(false);
  });
});

describe("weekKey", () => {
  it("returns the Monday of the containing week", () => {
    expect(weekKey("2026-08-17")).toBe("2026-08-17"); // Monday stays itself
    expect(weekKey("2026-08-19")).toBe("2026-08-17"); // Wednesday
    expect(weekKey("2026-08-21")).toBe("2026-08-17"); // Friday
    expect(weekKey("2026-08-31")).toBe("2026-08-31"); // Monday of next week
    expect(weekKey("2026-09-01")).toBe("2026-08-31"); // Tuesday
  });

  it("puts Sunday into the week that started the previous Monday", () => {
    expect(weekKey("2026-08-23")).toBe("2026-08-17");
  });

  it("accepts Date objects", () => {
    expect(weekKey(new Date("2026-08-19T00:00:00Z"))).toBe("2026-08-17");
  });
});

describe("formatWeek", () => {
  it("labels a week key", () => {
    expect(formatWeek("2026-08-17")).toBe("Week of 17 Aug 2026");
  });

  it("handles null/undefined", () => {
    expect(formatWeek(null)).toBe("—");
    expect(formatWeek(undefined)).toBe("—");
  });
});

describe("attendanceEditable", () => {
  const day = "2026-08-17"; // editable until 2026-08-21T00:00:00Z (72h after the day ends)

  it("is editable during the day and for 72 hours after it ends", () => {
    expect(attendanceEditable(day, new Date("2026-08-17T23:59:59Z"))).toBe(true);
    expect(attendanceEditable(day, new Date("2026-08-20T23:59:59Z"))).toBe(true);
    expect(attendanceEditable(day, new Date("2026-08-21T00:00:00Z"))).toBe(true); // boundary inclusive
  });

  it("is no longer editable after the 72-hour window", () => {
    expect(attendanceEditable(day, new Date("2026-08-21T00:00:01Z"))).toBe(false);
    expect(attendanceEditable(day, new Date("2026-08-25T00:00:00Z"))).toBe(false);
  });
});

describe("daysAgoStr", () => {
  it("returns the date N days before today", () => {
    freezeClock();
    expect(daysAgoStr(0)).toBe("2026-08-18");
    expect(daysAgoStr(1)).toBe("2026-08-17");
    expect(daysAgoStr(3)).toBe("2026-08-15");
  });
});

describe("currentMonth", () => {
  it("formats as YYYY-MM", () => {
    expect(currentMonth(new Date(2026, 7, 18))).toBe("2026-08");
    expect(currentMonth(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("returns the current month by default", () => {
    freezeClock();
    expect(currentMonth()).toBe("2026-08");
  });
});

describe("monthRange", () => {
  it("returns the first and last day of the month", () => {
    expect(monthRange("2026-08")).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("handles leap years", () => {
    expect(monthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("formatDate", () => {
  it("formats YYYY-MM-DD as a short date", () => {
    expect(formatDate("2026-08-17")).toBe("17 Aug 2026");
    expect(formatDate("2026-03-10")).toBe("10 Mar 2026");
  });

  it("handles null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("formatDay / formatMonth", () => {
  it("formats the day and month parts", () => {
    expect(formatDay("2026-08-17")).toBe("17");
    expect(formatMonth("2026-08-17")).toBe("Aug");
  });

  it("handles null/undefined", () => {
    expect(formatDay(null)).toBe("—");
    expect(formatMonth(undefined)).toBe("—");
  });
});

describe("formatTime", () => {
  it("converts 24h to 12h with am/pm", () => {
    expect(formatTime("09:05")).toBe("9:05am");
    expect(formatTime("18:00")).toBe("6:00pm");
    expect(formatTime("12:00")).toBe("12:00pm");
    expect(formatTime("00:30")).toBe("12:30am");
    expect(formatTime("23:59")).toBe("11:59pm");
  });

  it("handles null and unparseable input", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime("not a time")).toBe("not a time");
  });
});

describe("formatDateTime / formatLongDate", () => {
  it("formats a timestamp", () => {
    expect(formatDateTime("2026-08-17T09:05:00Z")).toBe("17 Aug 2026, 09:05 am");
  });

  it("formats today's long date", () => {
    freezeClock();
    expect(formatLongDate()).toBe("Tuesday, 18 August 2026");
  });
});
